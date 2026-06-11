import { Router } from "express";
import { db } from "@workspace/db";
import { onboardingsTable, activityTable, commissionMasterTable, brandsTable, warehousesTable } from "@workspace/db";
import { eq, like, and, SQL } from "drizzle-orm";
import { authorize } from "../middlewares/rbac";
import { runKyb } from "../services/kybService";
import { writeAudit } from "../services/audit";

const router = Router();

function genRef() {
  const y = new Date().getFullYear();
  const n = String(Math.floor(Math.random() * 900) + 100);
  return `OB-${y}-${n}`;
}

router.get("/onboardings", async (req, res) => {
  try {
    const { status, search } = req.query as { status?: string; search?: string };
    const conditions: SQL[] = [];
    if (status) {
      conditions.push(eq(onboardingsTable.status, status as "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "ACTIVE"));
    }
    if (search) {
      conditions.push(like(onboardingsTable.companyName, `%${search}%`));
    }
    const rows = conditions.length > 0
      ? await db.select().from(onboardingsTable).where(and(...conditions)).orderBy(onboardingsTable.createdAt)
      : await db.select().from(onboardingsTable).orderBy(onboardingsTable.createdAt);

    res.json(rows.map((r) => ({
      id: r.id,
      ref: r.ref,
      companyName: r.companyName,
      brandName: r.brandName,
      companyType: r.companyType,
      submittedBy: r.submittedBy ?? "",
      submittedAt: r.submittedAt?.toISOString(),
      status: r.status,
      kybStatus: r.kybStatus,
      docsUploaded: r.docsUploaded,
      docsRequired: r.docsRequired,
      urgency: r.status === "SUBMITTED" && r.submittedAt && (Date.now() - r.submittedAt.getTime()) > 2 * 24 * 3600 * 1000 ? "Overdue" : "Normal",
    })));
  } catch (err) {
    req.log.error({ err }, "list onboardings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings", async (req, res) => {
  try {
    const body = req.body;
    const ref = genRef();
    const [row] = await db.insert(onboardingsTable).values({
      ref,
      status: "DRAFT",
      kybStatus: "NOT_STARTED",
      companyName: body.companyName,
      tradeName: body.tradeName,
      companyType: body.companyType,
      pan: body.pan,
      cin: body.cin,
      llpCode: body.llpCode,
      masterGstin: body.masterGstin,
      gstAvailable: body.gstAvailable !== false,
      tan: body.tan,
      registeredAddress: body.registeredAddress,
      stateCode: body.masterGstin ? body.masterGstin.substring(0, 2) : undefined,
      brandName: body.brandName,
      brandLegalName: body.brandLegalName,
      brandCategory: body.brandCategory,
      brandType: body.brandType,
      tcsApplicable: body.tcsApplicable !== false,
      bankAccount: body.bankAccount,
      bankIfsc: body.bankIfsc,
      bankName: body.bankName,
      spocName: body.spocName,
      spocEmail: body.spocEmail,
      spocMobile: body.spocMobile,
      warehouseName: body.warehouseName,
      warehouseState: body.warehouseState,
      warehouseGstin: body.warehouseGstin,
      warehouseAddress: body.warehouseAddress,
      commissionRate: String(body.commissionRate),
      commissionType: body.commissionType,
      returnWindowDays: body.returnWindowDays,
      tcsRate: String(body.tcsRate),
      tdsRate: String(body.tdsRate),
      docsUploaded: 0,
      docsRequired: 6,
    }).returning();

    // Create initial commission master record
    await db.insert(commissionMasterTable).values({
      onboardingId: row.id,
      commissionType: "FLAT_PERCENT",
      commissionPercent: String(body.commissionRate),
      effectiveFromDate: new Date().toISOString().split("T")[0],
      isCurrent: true,
      agreedByMakerId: "Anjali Patel",
      notes: "Initial commission rate set at onboarding",
    });

    // Auto-create primary brand entry in brands table
    const [newBrand] = await db.insert(brandsTable).values({
      onboardingId: row.id,
      companyId: `CO-${String(row.id).padStart(5, "0")}`,
      brandName: body.brandName,
      brandLegalName: body.brandLegalName,
      brandCategory: body.brandCategory,
      brandType: body.brandType,
      commissionRate: String(body.commissionRate ?? "0"),
      commissionType: body.commissionType ?? "FLAT_PERCENT",
      returnWindowDays: body.returnWindowDays ?? 15,
      tcsRate: String(body.tcsRate ?? "1"),
      tdsRate: String(body.tdsRate ?? "1"),
      tcsApplicable: body.tcsApplicable !== false,
      status: "ACTIVE",
    }).returning();

    const [brandWithCode] = await db.update(brandsTable)
      .set({ brandCode: `BR-${String(newBrand.id).padStart(5, "0")}` })
      .where(eq(brandsTable.id, newBrand.id))
      .returning();

    // Auto-create primary warehouse entry in warehouses table
    const [newWarehouse] = await db.insert(warehousesTable).values({
      brandId: brandWithCode.id,
      onboardingId: row.id,
      warehouseName: body.warehouseName,
      warehouseState: body.warehouseState,
      warehouseGstin: body.warehouseGstin,
      warehouseAddress: body.warehouseAddress,
      isPrimary: true,
      isActive: true,
      stateCode: body.warehouseGstin ? String(body.warehouseGstin).substring(0, 2) : undefined,
    }).returning();

    await db.update(warehousesTable)
      .set({ warehouseCode: `WH-${String(newWarehouse.id).padStart(5, "0")}` })
      .where(eq(warehousesTable.id, newWarehouse.id));

    await db.insert(activityTable).values({
      user: "Anjali Patel",
      action: `Created onboarding draft ${row.ref} for ${row.brandName}`,
      entityType: "onboarding",
      entityRef: row.ref,
      level: "info",
    });

    res.status(201).json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "create onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/onboardings/:id", async (req, res) => {
  try {
    const [row] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(req.params.id)));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "get onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/onboardings/:id", async (req, res) => {
  try {
    const body = req.body;
    const updates: Partial<typeof onboardingsTable.$inferInsert> = {};
    const fields = [
      "companyName","companyType","pan","cin","masterGstin","tan","registeredAddress",
      "brandName","brandLegalName","brandCategory","brandType","tcsApplicable",
      "bankAccount","bankIfsc","bankName","spocName","spocEmail","spocMobile",
      "warehouseName","warehouseState","warehouseGstin","warehouseAddress","commissionType","returnWindowDays",
      "panDocUrl","gstCertUrl","cinDocUrl","cancelledChequeUrl","signedAgreementUrl","digitalSignatureUrl",
    ] as const;
    for (const f of fields) {
      if (body[f] !== undefined) (updates as Record<string, unknown>)[f] = body[f];
    }
    if (body.commissionRate !== undefined) updates.commissionRate = String(body.commissionRate);
    if (body.tcsRate !== undefined) updates.tcsRate = String(body.tcsRate);
    if (body.tdsRate !== undefined) updates.tdsRate = String(body.tdsRate);
    if (body.masterGstin) updates.stateCode = body.masterGstin.substring(0, 2);

    // Count docs uploaded
    const current = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(req.params.id)));
    if (current[0]) {
      const merged = { ...current[0], ...updates };
      const docFields = ["panDocUrl","gstCertUrl","cancelledChequeUrl","signedAgreementUrl","digitalSignatureUrl"] as const;
      const uploaded = docFields.filter((f) => (merged as Record<string, unknown>)[f]).length + (merged.cinDocUrl ? 1 : 0);
      updates.docsUploaded = uploaded;
    }

    updates.updatedAt = new Date();
    const [row] = await db.update(onboardingsTable).set(updates).where(eq(onboardingsTable.id, parseInt(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "update onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// KYB simulation — BRD §3.2: triggered on PAN submission, blocks submission if failed
router.post("/onboardings/:id/kyb-check", async (req, res) => {
  try {
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(req.params.id)));
    if (!ob) return res.status(404).json({ error: "Not found" });

    // Simulate KYB API latency
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Run full KYB sequence: PAN → GST → CIN → Bank (BRD §3.2)
    const result = await runKyb(ob);
    const newStatus = result.passed ? "PASSED" : "FAILED";
    const verifiedAt = new Date();

    const [updated] = await db.update(onboardingsTable)
      .set({
        kybStatus: newStatus,
        kybVerifiedAt: verifiedAt,
        kybAttempts: ob.kybAttempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(onboardingsTable.id, parseInt(req.params.id)))
      .returning();

    await db.insert(activityTable).values({
      user: "System (KYB Engine)",
      action: `KYB ${newStatus} for ${ob.ref} — ${result.summary}`,
      entityType: "onboarding",
      entityRef: ob.ref,
      level: result.passed ? "success" : "warning",
    });

    await writeAudit(req, {
      entityType: "Onboarding",
      entityId: ob.id,
      action: "kyb_check",
      changedFields: { kybStatus: newStatus, checks: result.checks },
    });

    res.json({
      kybStatus: newStatus,
      verifiedAt: verifiedAt.toISOString(),
      kybAttempts: updated.kybAttempts,
      checks: result.checks,
      message: result.summary,
    });
  } catch (err) {
    req.log.error({ err }, "kyb-check error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings/:id/submit", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const submittedBy = (req.body as { submittedBy?: string } | undefined)?.submittedBy;
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(req.params.id)));
    if (!ob) return res.status(404).json({ error: "Not found" });

    // BRD §3.1: Cannot submit until KYB has passed
    if (ob.kybStatus !== "PASSED") {
      return res.status(400).json({ error: "KYB verification must pass before submission. Run KYB check first." });
    }

    const maker = submittedBy || "Anjali Patel";
    const [row] = await db.update(onboardingsTable)
      .set({ status: "SUBMITTED", submittedBy: maker, submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(onboardingsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.insert(activityTable).values({ user: maker, action: `Submitted ${row.ref} for Checker review`, entityType: "onboarding", entityRef: row.ref, level: "info" });
    await writeAudit(req, { entityType: "Onboarding", entityId: row.id, action: "submit", changedFields: { status: "SUBMITTED", submittedBy: maker } });
    res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "submit onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings/:id/approve", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { notes, checkerName } = req.body as { notes?: string; checkerName?: string };
    const checker = checkerName || "Rajesh Kumar";
    const [row] = await db.update(onboardingsTable)
      .set({
        status: "APPROVED", kybStatus: "PASSED",
        checkerName: checker, checkerNotes: notes,
        reviewedAt: new Date(), updatedAt: new Date(),
        // Simulate Fynd sync on approval
        fyndCompanyCode: `FYND-CO-${Math.floor(10000 + Math.random() * 90000)}`,
        fyndBrandId: `FYND-BR-${Math.floor(10000 + Math.random() * 90000)}`,
        fyndLocationId: `FYND-LOC-${Math.floor(10000 + Math.random() * 90000)}`,
      })
      .where(eq(onboardingsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });

    // Update commission master — mark checker approved
    await db.update(commissionMasterTable)
      .set({ approvedByCheckerId: checker })
      .where(and(eq(commissionMasterTable.onboardingId, row.id), eq(commissionMasterTable.isCurrent, true)));

    await db.insert(activityTable).values({ user: checker, action: `Approved onboarding ${row.ref} — Fynd sync initiated`, entityType: "onboarding", entityRef: row.ref, level: "success" });
    await writeAudit(req, { entityType: "Onboarding", entityId: row.id, action: "approve", changedFields: { status: "APPROVED", checkerName: checker, notes } });
    res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "approve onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings/:id/reject", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { notes, checkerName } = req.body as { notes?: string; checkerName?: string };
    const checker = checkerName || "Rajesh Kumar";
    const [row] = await db.update(onboardingsTable)
      .set({ status: "REJECTED", checkerName: checker, checkerNotes: notes, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(onboardingsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.insert(activityTable).values({ user: checker, action: `Rejected onboarding ${row.ref} — ${notes ?? "No reason"}`, entityType: "onboarding", entityRef: row.ref, level: "warning" });
    await writeAudit(req, { entityType: "Onboarding", entityId: row.id, action: "reject", changedFields: { status: "REJECTED", checkerName: checker, notes } });
    res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "reject onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Checker requests edits — sends submission back to Maker as DRAFT (BRD §3.1, spec step 5)
router.post("/onboardings/:id/request-edit", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { notes, checkerName } = req.body as { notes?: string; checkerName?: string };
    const checker = checkerName || "Rajesh Kumar";
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(req.params.id)));
    if (!ob) return res.status(404).json({ error: "Not found" });
    if (ob.status !== "SUBMITTED") {
      return res.status(400).json({ error: "Only submitted onboardings can be sent back for edits." });
    }
    const [row] = await db.update(onboardingsTable)
      .set({ status: "DRAFT", checkerName: checker, checkerNotes: notes, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(onboardingsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.insert(activityTable).values({ user: checker, action: `Requested edits on ${row.ref} — ${notes ?? "see notes"}`, entityType: "onboarding", entityRef: row.ref, level: "warning" });
    await writeAudit(req, { entityType: "Onboarding", entityId: row.id, action: "request_edit", changedFields: { status: "DRAFT", checkerName: checker, notes } });
    res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "request-edit onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapOnboarding(r: typeof onboardingsTable.$inferSelect) {
  return {
    id: r.id,
    ref: r.ref,
    status: r.status,
    kybStatus: r.kybStatus,
    kybVerifiedAt: r.kybVerifiedAt?.toISOString(),
    kybAttempts: r.kybAttempts,
    companyName: r.companyName,
    tradeName: r.tradeName,
    companyType: r.companyType,
    pan: r.pan,
    cin: r.cin,
    llpCode: r.llpCode,
    masterGstin: r.masterGstin,
    gstAvailable: r.gstAvailable,
    tan: r.tan,
    registeredAddress: r.registeredAddress,
    stateCode: r.stateCode,
    brandName: r.brandName,
    brandLegalName: r.brandLegalName,
    brandCategory: r.brandCategory,
    brandType: r.brandType,
    tcsApplicable: r.tcsApplicable,
    bankAccount: r.bankAccount,
    bankIfsc: r.bankIfsc,
    bankName: r.bankName,
    spocName: r.spocName,
    spocEmail: r.spocEmail,
    spocMobile: r.spocMobile,
    warehouseName: r.warehouseName,
    warehouseState: r.warehouseState,
    warehouseGstin: r.warehouseGstin,
    warehouseAddress: r.warehouseAddress,
    commissionRate: parseFloat(r.commissionRate),
    commissionType: r.commissionType,
    returnWindowDays: r.returnWindowDays,
    tcsRate: parseFloat(r.tcsRate),
    tdsRate: parseFloat(r.tdsRate),
    panDocUrl: r.panDocUrl,
    gstCertUrl: r.gstCertUrl,
    cinDocUrl: r.cinDocUrl,
    cancelledChequeUrl: r.cancelledChequeUrl,
    signedAgreementUrl: r.signedAgreementUrl,
    digitalSignatureUrl: r.digitalSignatureUrl,
    docsUploaded: r.docsUploaded,
    docsRequired: r.docsRequired,
    submittedBy: r.submittedBy,
    submittedAt: r.submittedAt?.toISOString(),
    checkerName: r.checkerName,
    checkerNotes: r.checkerNotes,
    reviewedAt: r.reviewedAt?.toISOString(),
    fyndCompanyCode: r.fyndCompanyCode,
    fyndBrandId: r.fyndBrandId,
    fyndLocationId: r.fyndLocationId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export default router;
