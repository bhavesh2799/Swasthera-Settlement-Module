import { Router } from "express";
import { db } from "@workspace/db";
import { onboardingsTable } from "@workspace/db";
import { eq, like, and, SQL } from "drizzle-orm";
import { activityTable } from "@workspace/db";

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
    const [row] = await db.insert(onboardingsTable).values({
      ref: genRef(),
      status: "DRAFT",
      kybStatus: "NOT_STARTED",
      companyName: body.companyName,
      companyType: body.companyType,
      pan: body.pan,
      cin: body.cin,
      masterGstin: body.masterGstin,
      tan: body.tan,
      bankAccount: body.bankAccount,
      bankIfsc: body.bankIfsc,
      bankName: body.bankName,
      spocName: body.spocName,
      spocEmail: body.spocEmail,
      spocMobile: body.spocMobile,
      brandName: body.brandName,
      brandCategory: body.brandCategory,
      brandType: body.brandType,
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
      docsRequired: 5,
    }).returning();

    await db.insert(activityTable).values({
      user: "System",
      action: `Created onboarding draft ${row.ref}`,
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
    const fields = ["companyName","companyType","pan","cin","masterGstin","tan","bankAccount","bankIfsc","bankName","spocName","spocEmail","spocMobile","brandName","brandCategory","brandType","warehouseName","warehouseState","warehouseGstin","warehouseAddress","commissionType","returnWindowDays"] as const;
    for (const f of fields) {
      if (body[f] !== undefined) (updates as Record<string, unknown>)[f] = body[f];
    }
    if (body.commissionRate !== undefined) updates.commissionRate = String(body.commissionRate);
    if (body.tcsRate !== undefined) updates.tcsRate = String(body.tcsRate);
    if (body.tdsRate !== undefined) updates.tdsRate = String(body.tdsRate);
    updates.updatedAt = new Date();

    const [row] = await db.update(onboardingsTable).set(updates).where(eq(onboardingsTable.id, parseInt(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "update onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings/:id/submit", async (req, res) => {
  try {
    const [row] = await db.update(onboardingsTable)
      .set({ status: "SUBMITTED", kybStatus: "PENDING", submittedBy: "Anjali Patel", submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(onboardingsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.insert(activityTable).values({ user: "Anjali Patel", action: `Submitted ${row.ref} for Checker review`, entityType: "onboarding", entityRef: row.ref, level: "info" });
    res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "submit onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings/:id/approve", async (req, res) => {
  try {
    const { notes } = req.body as { notes?: string };
    const [row] = await db.update(onboardingsTable)
      .set({ status: "APPROVED", kybStatus: "PASSED", checkerName: "Rajesh Kumar", checkerNotes: notes, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(onboardingsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.insert(activityTable).values({ user: "Rajesh Kumar", action: `Approved onboarding ${row.ref}`, entityType: "onboarding", entityRef: row.ref, level: "success" });
    res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "approve onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboardings/:id/reject", async (req, res) => {
  try {
    const { notes } = req.body as { notes?: string };
    const [row] = await db.update(onboardingsTable)
      .set({ status: "REJECTED", checkerName: "Rajesh Kumar", checkerNotes: notes, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(onboardingsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.insert(activityTable).values({ user: "Rajesh Kumar", action: `Rejected onboarding ${row.ref} — ${notes ?? "No reason"}`, entityType: "onboarding", entityRef: row.ref, level: "warning" });
    res.json(mapOnboarding(row));
  } catch (err) {
    req.log.error({ err }, "reject onboarding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapOnboarding(r: typeof onboardingsTable.$inferSelect) {
  return {
    id: r.id,
    ref: r.ref,
    status: r.status,
    kybStatus: r.kybStatus,
    companyName: r.companyName,
    companyType: r.companyType,
    pan: r.pan,
    cin: r.cin,
    masterGstin: r.masterGstin,
    tan: r.tan,
    bankAccount: r.bankAccount,
    bankIfsc: r.bankIfsc,
    bankName: r.bankName,
    spocName: r.spocName,
    spocEmail: r.spocEmail,
    spocMobile: r.spocMobile,
    brandName: r.brandName,
    brandCategory: r.brandCategory,
    brandType: r.brandType,
    warehouseName: r.warehouseName,
    warehouseState: r.warehouseState,
    warehouseGstin: r.warehouseGstin,
    warehouseAddress: r.warehouseAddress,
    commissionRate: parseFloat(r.commissionRate),
    commissionType: r.commissionType,
    returnWindowDays: r.returnWindowDays,
    tcsRate: parseFloat(r.tcsRate),
    tdsRate: parseFloat(r.tdsRate),
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
