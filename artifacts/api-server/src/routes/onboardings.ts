import { Router } from "express";
import { db } from "@workspace/db";
import { onboardingsTable, activityTable, commissionMasterTable, brandsTable, warehousesTable, bankAccountsTable } from "@workspace/db";
import { eq, like, and, SQL } from "drizzle-orm";
import { authorize } from "../middlewares/rbac";
import { runKyb } from "../services/kybService";
import { writeAudit } from "../services/audit";
import { notify } from "../services/notify";

interface BankAccountInput {
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branchName?: string;
  accountType?: "current" | "savings";
  isPrimary?: boolean;
}

const router = Router();

function genRef() {
  const y = new Date().getFullYear();
  const n = String(Math.floor(Math.random() * 900) + 100);
  return `OB-${y}-${n}`;
}

function parsePending(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Company + document fields a Maker may edit (post-approval via propose-changes,
// or directly via PUT while DRAFT/REJECTED).
const ONBOARDING_TEXT_FIELDS = [
  "companyName","tradeName","companyType","pan","cin","llpCode","masterGstin","tan","registeredAddress",
  "entityTypeOther","registrationStatus","dateOfRegistration","taxpayerType","jurisdictionCode","natureOfBusiness",
  "brandName","brandLegalName","brandCategory","brandType","tcsApplicable",
  "bankAccount","bankIfsc","bankName","spocName","spocEmail","spocMobile","opsSpocName","opsSpocEmail","opsSpocMobile",
  "warehouseName","warehouseState","warehouseGstin","warehouseAddress","commissionType","returnWindowDays",
  "panDocUrl","gstCertUrl","cinDocUrl","cancelledChequeUrl","signedAgreementUrl","digitalSignatureUrl",
  "msmeCertUrl","tanCopyUrl",
] as const;

const ONBOARDING_EDITABLE_KEYS = [
  ...ONBOARDING_TEXT_FIELDS, "commissionRate", "tcsRate", "tdsRate", "mdrRate", "extraDocuments",
] as const;

// Translate a raw body / pendingChanges object into a typed update set,
// mirroring the conversions used by PUT (numeric → string, JSON serialisation).
function buildOnboardingUpdates(body: Record<string, unknown>): Partial<typeof onboardingsTable.$inferInsert> {
  const updates: Partial<typeof onboardingsTable.$inferInsert> = {};
  for (const f of ONBOARDING_TEXT_FIELDS) {
    if (body[f] !== undefined) (updates as Record<string, unknown>)[f] = body[f];
  }
  if (body.extraDocuments !== undefined) {
    updates.extraDocuments = typeof body.extraDocuments === "string"
      ? body.extraDocuments
      : JSON.stringify(body.extraDocuments);
  }
  if (body.commissionRate !== undefined) updates.commissionRate = String(body.commissionRate);
  if (body.tcsRate !== undefined) updates.tcsRate = String(body.tcsRate);
  if (body.tdsRate !== undefined) updates.tdsRate = String(body.tdsRate);
  if (body.mdrRate !== undefined) updates.mdrRate = String(body.mdrRate);
  if (body.masterGstin) updates.stateCode = String(body.masterGstin).substring(0, 2);
  return updates;
}

// Required document set (BRD FIX 6): Company PAN/GST/TAN/DigitalSig + Brand
// SignedAgreement/CancelledCheque. CIN and MSME are optional.
function recomputeDocCounts(merged: { extraDocuments?: string | null } & Record<string, unknown>) {
  const docFields = ["panDocUrl","gstCertUrl","tanCopyUrl","digitalSignatureUrl","signedAgreementUrl","cancelledChequeUrl"] as const;
  let extras: Array<{ label?: string; level?: string }> = [];
  try {
    extras = merged.extraDocuments ? (JSON.parse(merged.extraDocuments) as Array<{ label?: string; level?: string }>) : [];
  } catch {
    extras = [];
  }
  const taggedLabel = (label: string) => extras.some((d) => d.level === "brand" && d.label === label);
  const fieldSatisfied = (f: (typeof docFields)[number]) => {
    if ((merged as Record<string, unknown>)[f]) return true;
    if (f === "signedAgreementUrl") return taggedLabel("Signed Agreement");
    if (f === "cancelledChequeUrl") return taggedLabel("Cancelled Cheque");
    return false;
  };
  return { docsUploaded: docFields.filter(fieldSatisfied).length, docsRequired: docFields.length };
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

    return res.json(rows.map((r) => ({
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
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings", async (req, res) => {
  try {
    const body = req.body;
    const ref = genRef();
    // KYB is NOT auto-passed at create time. GST registration is mandatory, and the
    // Maker must run the full KYB fetch (POST /onboardings/:id/kyb-check — PAN, GST,
    // CIN and live bank verification) before the onboarding can be submitted for
    // review. A new onboarding therefore always starts NOT_STARTED.
    const [row] = await db.insert(onboardingsTable).values({
      ref,
      status: "DRAFT",
      kybStatus: "NOT_STARTED",
      kybVerifiedAt: undefined,
      companyName: body.companyName,
      tradeName: body.tradeName,
      companyType: body.companyType,
      pan: body.pan,
      cin: body.cin,
      llpCode: body.llpCode,
      masterGstin: body.masterGstin,
      gstAvailable: true,
      tan: body.tan,
      registeredAddress: body.registeredAddress,
      stateCode: body.masterGstin ? body.masterGstin.substring(0, 2) : undefined,
      entityTypeOther: body.entityTypeOther,
      registrationStatus: body.registrationStatus,
      dateOfRegistration: body.dateOfRegistration,
      taxpayerType: body.taxpayerType,
      jurisdictionCode: body.jurisdictionCode,
      natureOfBusiness: body.natureOfBusiness,
      brandName: body.brandName,
      brandLegalName: body.brandLegalName,
      brandCategory: body.brandCategory,
      brandType: body.brandType,
      tcsApplicable: body.tcsApplicable !== false,
      bankAccount: body.bankAccount ?? body.bankAccounts?.[0]?.accountNumber ?? "",
      bankIfsc: body.bankIfsc ?? body.bankAccounts?.[0]?.ifsc ?? "",
      bankName: body.bankName ?? body.bankAccounts?.[0]?.bankName ?? "",
      spocName: body.spocName,
      spocEmail: body.spocEmail,
      spocMobile: body.spocMobile,
      opsSpocName: body.opsSpocName,
      opsSpocEmail: body.opsSpocEmail,
      opsSpocMobile: body.opsSpocMobile,
      warehouseName: body.warehouseName,
      warehouseState: body.warehouseState,
      warehouseGstin: body.warehouseGstin,
      warehouseAddress: body.warehouseAddress,
      commissionRate: String(body.commissionRate),
      commissionType: body.commissionType,
      returnWindowDays: body.returnWindowDays,
      tcsRate: String(body.tcsRate),
      tdsRate: String(body.tdsRate),
      mdrRate: body.mdrRate !== undefined ? String(body.mdrRate) : "0",
      panDocUrl: body.panDocUrl,
      gstCertUrl: body.gstCertUrl,
      cinDocUrl: body.cinDocUrl,
      cancelledChequeUrl: body.cancelledChequeUrl,
      signedAgreementUrl: body.signedAgreementUrl,
      digitalSignatureUrl: body.digitalSignatureUrl,
      msmeCertUrl: body.msmeCertUrl,
      tanCopyUrl: body.tanCopyUrl,
      extraDocuments: body.extraDocuments ? JSON.stringify(body.extraDocuments) : undefined,
      docsUploaded: 0,
      docsRequired: 6,
    }).returning();

    // Create initial commission master record
    await db.insert(commissionMasterTable).values({
      onboardingId: row.id,
      commissionType: "FLAT_PERCENT",
      commissionPercent: String(body.commissionRate),
      mdrRate: body.mdrRate !== undefined ? String(body.mdrRate) : undefined,
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
      mdrRate: String(body.mdrRate ?? "0"),
      tcsApplicable: body.tcsApplicable !== false,
      spocName: body.brandSpocName ?? body.spocName,
      spocEmail: body.brandSpocEmail ?? body.spocEmail,
      spocMobile: body.brandSpocMobile ?? body.spocMobile,
      opsSpocName: body.brandOpsSpocName ?? body.opsSpocName,
      opsSpocEmail: body.brandOpsSpocEmail ?? body.opsSpocEmail,
      opsSpocMobile: body.brandOpsSpocMobile ?? body.opsSpocMobile,
      brandCompanyAgreementUrl: body.brandCompanyAgreementUrl,
      status: "ACTIVE",
    }).returning();

    const [brandWithCode] = await db.update(brandsTable)
      .set({ brandCode: `BR-${String(newBrand.id).padStart(5, "0")}` })
      .where(eq(brandsTable.id, newBrand.id))
      .returning();

    // Multiple bank accounts at brand level (BRD FIX 5)
    const bankAccounts: BankAccountInput[] = Array.isArray(body.bankAccounts) ? body.bankAccounts : [];
    if (bankAccounts.length > 0) {
      const hasPrimary = bankAccounts.some((b) => b.isPrimary);
      await db.insert(bankAccountsTable).values(
        bankAccounts
          .filter((b) => b.accountNumber && b.ifsc)
          .map((b, idx) => ({
            brandId: brandWithCode.id,
            onboardingId: row.id,
            accountNumber: b.accountNumber,
            ifsc: b.ifsc,
            bankName: b.bankName,
            branchName: b.branchName,
            accountType: b.accountType ?? "current",
            isPrimary: hasPrimary ? !!b.isPrimary : idx === 0,
          })),
      );
    } else if (body.bankAccount && body.bankIfsc) {
      await db.insert(bankAccountsTable).values({
        brandId: brandWithCode.id,
        onboardingId: row.id,
        accountNumber: body.bankAccount,
        ifsc: body.bankIfsc,
        bankName: body.bankName ?? "",
        accountType: "current",
        isPrimary: true,
      });
    }

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
    await notify(req, {
      action: "Created onboarding draft",
      entityType: "onboarding",
      entityId: row.id,
      recordName: `${row.ref} — ${row.brandName}`,
      link: `/onboarding/${row.id}`,
      level: "info",
    });

    return res.status(201).json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "create onboarding error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/onboardings/:id", async (req, res) => {
  try {
    const [row] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(String(req.params.id))));
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "get onboarding error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/onboardings/:id", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const body = req.body ?? {};
    const updates = buildOnboardingUpdates(body);

    // Count docs uploaded
    const current = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(String(req.params.id))));
    if (!current[0]) return res.status(404).json({ error: "Not found" });

    // Governance: direct edits are only allowed pre-approval. Once SUBMITTED the
    // record is locked, and post-approval (APPROVED/ACTIVE) changes must go
    // through the propose-changes → approve/reject channel.
    if (current[0].status === "DRAFT" || current[0].status === "REJECTED") {
      const merged = { ...current[0], ...updates };
      const { docsUploaded, docsRequired } = recomputeDocCounts(merged);
      updates.docsUploaded = docsUploaded;
      updates.docsRequired = docsRequired;
    } else {
      return res.status(409).json({
        error: current[0].status === "SUBMITTED"
          ? "Onboarding is under Checker review and cannot be edited directly."
          : "Onboarding is approved — submit changes via propose-changes for Checker approval.",
      });
    }

    updates.updatedAt = new Date();
    const [row] = await db.update(onboardingsTable).set(updates).where(eq(onboardingsTable.id, parseInt(String(req.params.id)))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "update onboarding error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Post-approval company / document change governance ───────────────────────
// Once an onboarding is APPROVED/ACTIVE, the Maker can no longer edit it directly.
// Instead they propose company-field or document changes here; the proposal is
// stored on `pendingChanges` (the onboarding.status lifecycle is left untouched)
// and applied only when a Checker approves.

// Maker proposes company/document edits — stored as pendingChanges, awaits Checker
router.post("/onboardings/:id/propose-changes", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(String(req.params.id))));
    if (!ob) return res.status(404).json({ error: "Not found" });

    // Governance: propose-changes is the post-approval channel. Pre-approval
    // records (DRAFT/REJECTED) should use direct PUT; SUBMITTED stays locked.
    if (ob.status !== "APPROVED" && ob.status !== "ACTIVE") {
      return res.status(409).json({
        error: ob.status === "SUBMITTED"
          ? "Onboarding is under Checker review and cannot be changed."
          : "Onboarding is not yet approved — edit it directly instead.",
      });
    }

    // Accumulate onto any existing pending proposal so multiple edits stack.
    const existing = parsePending(ob.pendingChanges) ?? {};
    const proposed: Record<string, unknown> = { ...existing };
    for (const f of ONBOARDING_EDITABLE_KEYS) {
      if (body[f] !== undefined) proposed[f] = body[f];
    }
    if (Object.keys(proposed).length === 0) {
      return res.status(400).json({ error: "No editable fields supplied" });
    }

    const [row] = await db.update(onboardingsTable)
      .set({ pendingChanges: JSON.stringify(proposed), updatedAt: new Date() })
      .where(eq(onboardingsTable.id, ob.id))
      .returning();

    await db.insert(activityTable).values({
      user: req.user?.name ?? "Maker",
      action: `Proposed changes to onboarding ${ob.ref} — awaiting Checker approval`,
      entityType: "onboarding",
      entityRef: ob.ref,
      level: "info",
    });
    await writeAudit(req, { entityType: "Onboarding", entityId: ob.id, action: "propose_changes", changedFields: proposed });
    await notify(req, {
      action: "Proposed changes — awaiting approval",
      entityType: "onboarding",
      entityId: ob.id,
      recordName: `${ob.ref} — ${ob.brandName}`,
      link: `/onboarding/${ob.id}`,
      level: "info",
    });
    return res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "propose onboarding changes error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checker approves pending company/document changes — applies them to the record
router.post("/onboardings/:id/approve-changes", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { checkerName } = (req.body ?? {}) as { checkerName?: string };
    const checker = checkerName || "Rajesh Kumar";
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(String(req.params.id))));
    if (!ob) return res.status(404).json({ error: "Not found" });
    const pending = parsePending(ob.pendingChanges);
    if (!pending) return res.status(400).json({ error: "No pending changes to approve" });

    const updates = buildOnboardingUpdates(pending);
    const merged = { ...ob, ...updates };
    const { docsUploaded, docsRequired } = recomputeDocCounts(merged);
    updates.docsUploaded = docsUploaded;
    updates.docsRequired = docsRequired;
    updates.pendingChanges = null;
    updates.updatedAt = new Date();

    const [row] = await db.update(onboardingsTable).set(updates).where(eq(onboardingsTable.id, ob.id)).returning();
    await db.insert(activityTable).values({
      user: checker,
      action: `Approved changes to onboarding ${ob.ref}`,
      entityType: "onboarding",
      entityRef: ob.ref,
      level: "success",
    });
    await writeAudit(req, { entityType: "Onboarding", entityId: ob.id, action: "approve_changes", changedFields: pending });
    await notify(req, {
      action: "Approved changes",
      entityType: "onboarding",
      entityId: ob.id,
      recordName: `${ob.ref} — ${ob.brandName}`,
      link: `/onboarding/${ob.id}`,
      level: "success",
    });
    return res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "approve onboarding changes error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checker rejects pending company/document changes — discards the proposal
router.post("/onboardings/:id/reject-changes", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { notes, checkerName } = (req.body ?? {}) as { notes?: string; checkerName?: string };
    const checker = checkerName || "Rajesh Kumar";
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(String(req.params.id))));
    if (!ob) return res.status(404).json({ error: "Not found" });
    if (!ob.pendingChanges) return res.status(400).json({ error: "No pending changes to reject" });

    const [row] = await db.update(onboardingsTable)
      .set({ pendingChanges: null, updatedAt: new Date() })
      .where(eq(onboardingsTable.id, ob.id))
      .returning();

    await db.insert(activityTable).values({
      user: checker,
      action: `Rejected changes to onboarding ${ob.ref}${notes ? ` — ${notes}` : ""}`,
      entityType: "onboarding",
      entityRef: ob.ref,
      level: "warning",
    });
    await writeAudit(req, { entityType: "Onboarding", entityId: ob.id, action: "reject_changes", changedFields: notes ? { notes } : undefined });
    return res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "reject onboarding changes error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// KYB simulation — BRD §3.2: triggered on PAN submission, blocks submission if failed
router.post("/onboardings/:id/kyb-check", async (req, res) => {
  try {
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(String(req.params.id))));
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
      .where(eq(onboardingsTable.id, parseInt(String(req.params.id))))
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

    return res.json({
      kybStatus: newStatus,
      verifiedAt: verifiedAt.toISOString(),
      kybAttempts: updated.kybAttempts,
      checks: result.checks,
      message: result.summary,
    });
  } catch (err) {
    req.log.error({ err }, "kyb-check error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings/:id/submit", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const submittedBy = (req.body as { submittedBy?: string } | undefined)?.submittedBy;
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(String(req.params.id))));
    if (!ob) return res.status(404).json({ error: "Not found" });

    // GST registration is mandatory and the company-level KYB fetch must have run
    // and passed before a Maker can submit for Checker review. kybVerifiedAt is only
    // set by the /kyb-check fetch, so requiring it proves the check actually ran
    // (a PASSED status alone is not sufficient evidence).
    if (ob.kybStatus !== "PASSED" || !ob.kybVerifiedAt) {
      return res.status(400).json({ error: "Company KYB must be run and passed (GST + PAN + bank verified) before submitting for review." });
    }

    const maker = submittedBy || "Anjali Patel";
    // Resubmission after rejection bumps the version (BRD FIX 7)
    const isResubmit = ob.status === "REJECTED";
    const [row] = await db.update(onboardingsTable)
      .set({
        status: "SUBMITTED",
        submittedBy: maker,
        submittedAt: new Date(),
        updatedAt: new Date(),
        ...(isResubmit ? { version: ob.version + 1 } : {}),
      })
      .where(eq(onboardingsTable.id, parseInt(String(req.params.id))))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    const submitAction = isResubmit ? `Re-submitted ${row.ref} for Checker review (v${row.version})` : `Submitted ${row.ref} for Checker review`;
    await db.insert(activityTable).values({ user: maker, action: submitAction, entityType: "onboarding", entityRef: row.ref, level: "info" });
    await writeAudit(req, { entityType: "Onboarding", entityId: row.id, action: "submit", changedFields: { status: "SUBMITTED", submittedBy: maker, version: row.version } });
    await notify(req, {
      action: isResubmit ? "Re-submitted for review" : "Submitted for review",
      entityType: "onboarding",
      entityId: row.id,
      recordName: `${row.ref} — ${row.brandName}`,
      link: `/onboarding/${row.id}`,
      level: "info",
    });
    return res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "submit onboarding error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings/:id/approve", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { notes, checkerName } = (req.body ?? {}) as { notes?: string; checkerName?: string };
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
      .where(eq(onboardingsTable.id, parseInt(String(req.params.id))))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });

    // Update commission master — mark checker approved
    await db.update(commissionMasterTable)
      .set({ approvedByCheckerId: checker })
      .where(and(eq(commissionMasterTable.onboardingId, row.id), eq(commissionMasterTable.isCurrent, true)));

    await db.insert(activityTable).values({ user: checker, action: `Approved onboarding ${row.ref} — Fynd sync initiated`, entityType: "onboarding", entityRef: row.ref, level: "success" });
    await writeAudit(req, { entityType: "Onboarding", entityId: row.id, action: "approve", changedFields: { status: "APPROVED", checkerName: checker, notes } });
    await notify(req, {
      action: "Approved onboarding",
      entityType: "onboarding",
      entityId: row.id,
      recordName: `${row.ref} — ${row.brandName}`,
      link: `/onboarding/${row.id}`,
      level: "success",
    });
    return res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "approve onboarding error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings/:id/reject", authorize(["checker", "admin"]), async (req, res) => {
  try {
    // Accept both `notes` (server contract) and `rejectionReason` (generated client hook key).
    const body = req.body as { notes?: string; rejectionReason?: string; checkerName?: string };
    const notes = body.notes ?? body.rejectionReason;
    const checkerName = body.checkerName;
    const checker = checkerName || "Rajesh Kumar";
    const [row] = await db.update(onboardingsTable)
      .set({ status: "REJECTED", checkerName: checker, checkerNotes: notes, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(onboardingsTable.id, parseInt(String(req.params.id))))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.insert(activityTable).values({ user: checker, action: `Rejected onboarding ${row.ref} — ${notes ?? "No reason"}`, entityType: "onboarding", entityRef: row.ref, level: "warning" });
    await writeAudit(req, { entityType: "Onboarding", entityId: row.id, action: "reject", changedFields: { status: "REJECTED", checkerName: checker, notes } });
    await notify(req, {
      action: "Rejected onboarding — awaiting Maker edit",
      entityType: "onboarding",
      entityId: row.id,
      recordName: `${row.ref} — ${row.brandName}`,
      link: `/onboarding/${row.id}`,
      level: "warning",
    });
    return res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "reject onboarding error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checker requests edits — sends submission back to Maker as DRAFT (BRD §3.1, spec step 5)
router.post("/onboardings/:id/request-edit", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { notes, checkerName } = (req.body ?? {}) as { notes?: string; checkerName?: string };
    const checker = checkerName || "Rajesh Kumar";
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, parseInt(String(req.params.id))));
    if (!ob) return res.status(404).json({ error: "Not found" });
    if (ob.status !== "SUBMITTED") {
      return res.status(400).json({ error: "Only submitted onboardings can be sent back for edits." });
    }
    const [row] = await db.update(onboardingsTable)
      .set({ status: "DRAFT", checkerName: checker, checkerNotes: notes, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(onboardingsTable.id, parseInt(String(req.params.id))))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.insert(activityTable).values({ user: checker, action: `Requested edits on ${row.ref} — ${notes ?? "see notes"}`, entityType: "onboarding", entityRef: row.ref, level: "warning" });
    await writeAudit(req, { entityType: "Onboarding", entityId: row.id, action: "request_edit", changedFields: { status: "DRAFT", checkerName: checker, notes } });
    await notify(req, {
      action: "Requested edits",
      entityType: "onboarding",
      entityId: row.id,
      recordName: `${row.ref} — ${row.brandName}`,
      link: `/onboarding/${row.id}`,
      level: "warning",
    });
    return res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "request-edit onboarding error");
    return res.status(500).json({ error: "Internal server error" });
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
    entityTypeOther: r.entityTypeOther,
    registrationStatus: r.registrationStatus,
    dateOfRegistration: r.dateOfRegistration,
    taxpayerType: r.taxpayerType,
    jurisdictionCode: r.jurisdictionCode,
    natureOfBusiness: r.natureOfBusiness,
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
    opsSpocName: r.opsSpocName,
    opsSpocEmail: r.opsSpocEmail,
    opsSpocMobile: r.opsSpocMobile,
    warehouseName: r.warehouseName,
    warehouseState: r.warehouseState,
    warehouseGstin: r.warehouseGstin,
    warehouseAddress: r.warehouseAddress,
    commissionRate: parseFloat(r.commissionRate),
    commissionType: r.commissionType,
    returnWindowDays: r.returnWindowDays,
    tcsRate: parseFloat(r.tcsRate),
    tdsRate: parseFloat(r.tdsRate),
    mdrRate: parseFloat(r.mdrRate),
    panDocUrl: r.panDocUrl,
    gstCertUrl: r.gstCertUrl,
    cinDocUrl: r.cinDocUrl,
    cancelledChequeUrl: r.cancelledChequeUrl,
    signedAgreementUrl: r.signedAgreementUrl,
    digitalSignatureUrl: r.digitalSignatureUrl,
    msmeCertUrl: r.msmeCertUrl,
    tanCopyUrl: r.tanCopyUrl,
    extraDocuments: r.extraDocuments ? JSON.parse(r.extraDocuments) : [],
    pendingChanges: parsePending(r.pendingChanges),
    version: r.version,
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
