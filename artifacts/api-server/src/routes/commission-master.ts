import { Router } from "express";
import { db } from "@workspace/db";
import { commissionMasterTable, activityTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authorize } from "../middlewares/rbac";
import { writeAudit } from "../services/audit";

const router = Router();

// List all commission rate versions for an onboarding (ordered oldest → newest)
router.get("/commission-master/:onboardingId", async (req, res) => {
  try {
    const rows = await db.select()
      .from(commissionMasterTable)
      .where(eq(commissionMasterTable.onboardingId, parseInt(String(req.params.onboardingId))))
      .orderBy(commissionMasterTable.createdAt);

    return res.json(rows.map(mapCommission));
  } catch (err) {
    req.log.error({ err }, "list commission master error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get the active (current) commercial terms for an onboarding
router.get("/commission-master/:onboardingId/active", async (req, res) => {
  try {
    const [row] = await db.select()
      .from(commissionMasterTable)
      .where(and(
        eq(commissionMasterTable.onboardingId, parseInt(String(req.params.onboardingId))),
        eq(commissionMasterTable.isCurrent, true),
      ))
      .limit(1);
    if (!row) return res.status(404).json({ error: "No active commercial terms" });
    return res.json(mapCommission(row));
  } catch (err) {
    req.log.error({ err }, "active commission error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Add a new commission rate version — archives the current one, auto-increments
// version, and requires an addendum document for version > 1 (spec step 6).
router.post("/commission-master/:onboardingId", async (req, res) => {
  try {
    const onboardingId = parseInt(String(req.params.onboardingId));
    const body = req.body as {
      commissionType?: string;
      commissionPercent?: number;
      tierConfig?: string;
      gmvTierType?: string;
      tdsRate?: number;
      tdsTan?: string;
      tdsLimit?: number;
      tcsRate?: number;
      returnWindowDays?: number;
      settlementHoldDays?: number;
      addendumDocUrl?: string;
      effectiveFromDate: string;
      notes?: string;
      agreedByMakerId?: string;
    };

    // Determine next version number for this onboarding
    const [latest] = await db.select()
      .from(commissionMasterTable)
      .where(eq(commissionMasterTable.onboardingId, onboardingId))
      .orderBy(desc(commissionMasterTable.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;

    // Addendum document is mandatory from the second version onward
    if (nextVersion > 1 && !body.addendumDocUrl) {
      return res.status(400).json({ error: "An addendum document is required when revising commercial terms (version > 1)." });
    }

    // Archive current version
    await db.update(commissionMasterTable)
      .set({ isCurrent: false, effectiveToDate: body.effectiveFromDate })
      .where(and(
        eq(commissionMasterTable.onboardingId, onboardingId),
        eq(commissionMasterTable.isCurrent, true),
      ));

    const commissionType = (body.commissionType ?? "FLAT_PERCENT") as "FLAT_PERCENT" | "TIERED" | "SLAB" | "GMV_TIER";

    const [row] = await db.insert(commissionMasterTable).values({
      onboardingId,
      version: nextVersion,
      commissionType,
      commissionPercent: body.commissionPercent != null ? String(body.commissionPercent) : null,
      tierConfig: body.tierConfig,
      gmvTierType: body.gmvTierType ? (body.gmvTierType as "THRESHOLD" | "CUMULATIVE") : null,
      tdsRate: body.tdsRate != null ? String(body.tdsRate) : null,
      tdsTan: body.tdsTan,
      tdsLimit: body.tdsLimit != null ? String(body.tdsLimit) : undefined,
      tcsRate: body.tcsRate != null ? String(body.tcsRate) : null,
      returnWindowDays: body.returnWindowDays,
      settlementHoldDays: body.settlementHoldDays,
      addendumDocUrl: body.addendumDocUrl,
      effectiveFromDate: body.effectiveFromDate,
      isCurrent: true,
      notes: body.notes,
      agreedByMakerId: body.agreedByMakerId || "Anjali Patel",
    }).returning();

    await db.insert(activityTable).values({
      user: body.agreedByMakerId || "Anjali Patel",
      action: `Commercial terms v${nextVersion} (${commissionType}) effective ${body.effectiveFromDate} for onboarding #${onboardingId}`,
      entityType: "onboarding",
      entityRef: String(onboardingId),
      level: "info",
    });
    await writeAudit(req, { entityType: "CommercialTerms", entityId: row.id, action: "create_version", changedFields: { version: nextVersion, commissionType } });

    return res.status(201).json(mapCommission(row));
  } catch (err) {
    req.log.error({ err }, "add commission version error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update TDS configuration on the active version (checker/admin) — spec step 6
router.put("/commission-master/:onboardingId/tds", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { tdsRate, tdsTan, tdsLimit } = req.body as { tdsRate?: number; tdsTan?: string; tdsLimit?: number };
    const [row] = await db.update(commissionMasterTable)
      .set({
        tdsRate: tdsRate != null ? String(tdsRate) : undefined,
        tdsTan: tdsTan ?? undefined,
        tdsLimit: tdsLimit != null ? String(tdsLimit) : undefined,
      })
      .where(and(
        eq(commissionMasterTable.onboardingId, parseInt(String(req.params.onboardingId))),
        eq(commissionMasterTable.isCurrent, true),
      ))
      .returning();
    if (!row) return res.status(404).json({ error: "No active commercial terms" });
    await writeAudit(req, { entityType: "CommercialTerms", entityId: row.id, action: "update_tds", changedFields: { tdsRate, tdsTan, tdsLimit } });
    return res.json(mapCommission(row));
  } catch (err) {
    req.log.error({ err }, "update tds error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update TCS configuration on the active version (checker/admin) — spec step 6
router.put("/commission-master/:onboardingId/tcs", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { tcsRate } = req.body as { tcsRate?: number };
    const [row] = await db.update(commissionMasterTable)
      .set({ tcsRate: tcsRate != null ? String(tcsRate) : undefined })
      .where(and(
        eq(commissionMasterTable.onboardingId, parseInt(String(req.params.onboardingId))),
        eq(commissionMasterTable.isCurrent, true),
      ))
      .returning();
    if (!row) return res.status(404).json({ error: "No active commercial terms" });
    await writeAudit(req, { entityType: "CommercialTerms", entityId: row.id, action: "update_tcs", changedFields: { tcsRate } });
    return res.json(mapCommission(row));
  } catch (err) {
    req.log.error({ err }, "update tcs error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function mapCommission(r: typeof commissionMasterTable.$inferSelect) {
  return {
    id: r.id,
    onboardingId: r.onboardingId,
    version: r.version,
    commissionType: r.commissionType,
    commissionPercent: r.commissionPercent ? parseFloat(r.commissionPercent) : null,
    tierConfig: r.tierConfig,
    gmvTierType: r.gmvTierType,
    tdsRate: r.tdsRate ? parseFloat(r.tdsRate) : null,
    tdsTan: r.tdsTan,
    tdsLimit: r.tdsLimit ? parseFloat(r.tdsLimit) : null,
    tcsRate: r.tcsRate ? parseFloat(r.tcsRate) : null,
    returnWindowDays: r.returnWindowDays,
    settlementHoldDays: r.settlementHoldDays,
    addendumDocUrl: r.addendumDocUrl,
    effectiveFromDate: r.effectiveFromDate,
    effectiveToDate: r.effectiveToDate,
    isCurrent: r.isCurrent,
    notes: r.notes,
    agreedByMakerId: r.agreedByMakerId,
    approvedByCheckerId: r.approvedByCheckerId,
    createdAt: r.createdAt.toISOString(),
  };
}

export default router;
