import { Router } from "express";
import { db } from "@workspace/db";
import { commissionMasterTable, activityTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

// List all commission rate versions for an onboarding (ordered oldest → newest)
router.get("/commission-master/:onboardingId", async (req, res) => {
  try {
    const rows = await db.select()
      .from(commissionMasterTable)
      .where(eq(commissionMasterTable.onboardingId, parseInt(req.params.onboardingId)))
      .orderBy(commissionMasterTable.createdAt);

    res.json(rows.map(mapCommission));
  } catch (err) {
    req.log.error({ err }, "list commission master error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add a new commission rate version — archives the current one (BRD §3.4 versioning)
router.post("/commission-master/:onboardingId", async (req, res) => {
  try {
    const onboardingId = parseInt(req.params.onboardingId);
    const body = req.body as {
      commissionType: string;
      commissionPercent: number;
      effectiveFromDate: string;
      notes?: string;
      tierConfig?: string;
      agreedByMakerId?: string;
    };

    // Archive current version: set effective_to_date and is_current = false
    await db.update(commissionMasterTable)
      .set({ isCurrent: false, effectiveToDate: body.effectiveFromDate })
      .where(and(
        eq(commissionMasterTable.onboardingId, onboardingId),
        eq(commissionMasterTable.isCurrent, true),
      ));

    // Insert new current version
    const [row] = await db.insert(commissionMasterTable).values({
      onboardingId,
      commissionType: body.commissionType as "FLAT_PERCENT" | "TIERED",
      commissionPercent: body.commissionPercent ? String(body.commissionPercent) : null,
      tierConfig: body.tierConfig,
      effectiveFromDate: body.effectiveFromDate,
      isCurrent: true,
      notes: body.notes,
      agreedByMakerId: body.agreedByMakerId || "Anjali Patel",
    }).returning();

    await db.insert(activityTable).values({
      user: body.agreedByMakerId || "Anjali Patel",
      action: `Commission rate updated to ${body.commissionPercent}% effective ${body.effectiveFromDate} for onboarding #${onboardingId}`,
      entityType: "onboarding",
      entityRef: String(onboardingId),
      level: "info",
    });

    res.status(201).json(mapCommission(row));
  } catch (err) {
    req.log.error({ err }, "add commission version error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapCommission(r: typeof commissionMasterTable.$inferSelect) {
  return {
    id: r.id,
    onboardingId: r.onboardingId,
    commissionType: r.commissionType,
    commissionPercent: r.commissionPercent ? parseFloat(r.commissionPercent) : null,
    tierConfig: r.tierConfig,
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
