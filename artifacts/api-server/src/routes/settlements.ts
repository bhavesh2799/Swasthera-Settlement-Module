import { Router } from "express";
import { db } from "@workspace/db";
import { settlementsTable, onboardingsTable, bagsTable, payoutsTable, activityTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/settlements", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = status
      ? await db.select().from(settlementsTable).where(eq(settlementsTable.status, status as "COMPUTED" | "PENDING_APPROVAL" | "APPROVED" | "PAID")).orderBy(settlementsTable.createdAt)
      : await db.select().from(settlementsTable).orderBy(settlementsTable.createdAt);

    res.json(rows.map((r) => ({
      id: r.id,
      cycle: r.cycle,
      companyName: r.companyName,
      brandName: r.brandName,
      eligibleBags: r.eligibleBags,
      grossGmv: parseFloat(r.grossGmv),
      netPayable: parseFloat(r.netPayable),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "list settlements error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/settlements", async (req, res) => {
  try {
    const { onboardingId, cycle } = req.body as { onboardingId: number; cycle: string };

    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, onboardingId));
    if (!ob) return res.status(404).json({ error: "Onboarding not found" });

    const eligibleBags = await db.select().from(bagsTable)
      .where(and(eq(bagsTable.brandId, ob.id), eq(bagsTable.cycle, cycle), eq(bagsTable.eligibility, "eligible")));

    const grossGmv = eligibleBags.reduce((s, b) => s + parseFloat(b.esp) * b.qty, 0);
    const brandPromotions = 0;
    const netBeforeCommission = grossGmv - brandPromotions;
    const commissionRate = parseFloat(ob.commissionRate);
    const commission = netBeforeCommission * commissionRate / 100;
    const gstOnCommission = commission * 0.18;
    const tcsAmount = eligibleBags.reduce((s, b) => s + parseFloat(b.tcsAmount), 0);
    const tdsAmount = eligibleBags.reduce((s, b) => s + parseFloat(b.tdsAmount), 0);
    const mdrCharges = 0;
    const penalty = 0;
    const netPayable = netBeforeCommission - commission - gstOnCommission - tcsAmount - tdsAmount - mdrCharges - penalty;

    const [row] = await db.insert(settlementsTable).values({
      cycle,
      onboardingId: ob.id,
      companyName: ob.companyName,
      brandName: ob.brandName,
      bankAccount: ob.bankAccount,
      bankIfsc: ob.bankIfsc,
      bankName: ob.bankName,
      eligibleBags: eligibleBags.length,
      bagIds: JSON.stringify(eligibleBags.map((b) => b.bagId)),
      grossGmv: String(grossGmv.toFixed(2)),
      brandPromotions: "0",
      netBeforeCommission: String(netBeforeCommission.toFixed(2)),
      commission: String(commission.toFixed(2)),
      commissionRate: ob.commissionRate,
      gstOnCommission: String(gstOnCommission.toFixed(2)),
      tcsAmount: String(tcsAmount.toFixed(2)),
      tdsAmount: String(tdsAmount.toFixed(2)),
      mdrCharges: "0",
      penalty: "0",
      netPayable: String(netPayable.toFixed(2)),
      status: "PENDING_APPROVAL",
    }).returning();

    await db.insert(activityTable).values({ user: "Anjali Patel", action: `Computed settlement for ${ob.brandName} — ${cycle}`, entityType: "settlement", entityRef: String(row.id), level: "info" });

    res.status(201).json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "create settlement error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/settlements/:id", async (req, res) => {
  try {
    const [row] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, parseInt(req.params.id)));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "get settlement error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/settlements/:id/approve", async (req, res) => {
  try {
    const { financeNotes } = req.body as { financeNotes?: string };
    const [existing] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, parseInt(req.params.id)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const [row] = await db.update(settlementsTable)
      .set({ status: "APPROVED", financeNotes, approvedBy: "Rajesh Kumar", approvedAt: new Date() })
      .where(eq(settlementsTable.id, parseInt(req.params.id)))
      .returning();

    await db.insert(payoutsTable).values({
      settlementId: row.id,
      cycle: row.cycle,
      companyName: row.companyName,
      brandName: row.brandName,
      bankAccount: row.bankAccount,
      bankIfsc: row.bankIfsc,
      bankName: row.bankName,
      amount: row.netPayable,
      transferMode: "NEFT",
      paymentRef: `PAY-${row.id}-${Date.now()}`,
      status: "INITIATED",
      bagCount: row.eligibleBags,
      bagIds: row.bagIds,
    });

    await db.insert(activityTable).values({ user: "Rajesh Kumar", action: `Approved settlement #${row.id} — payout initiated`, entityType: "settlement", entityRef: String(row.id), level: "success" });

    res.json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "approve settlement error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapSettlement(r: typeof settlementsTable.$inferSelect) {
  return {
    id: r.id,
    cycle: r.cycle,
    companyName: r.companyName,
    brandName: r.brandName,
    bankAccount: r.bankAccount,
    bankIfsc: r.bankIfsc,
    bankName: r.bankName,
    eligibleBags: r.eligibleBags,
    bagIds: JSON.parse(r.bagIds) as string[],
    grossGmv: parseFloat(r.grossGmv),
    brandPromotions: parseFloat(r.brandPromotions),
    netBeforeCommission: parseFloat(r.netBeforeCommission),
    commission: parseFloat(r.commission),
    commissionRate: parseFloat(r.commissionRate),
    gstOnCommission: parseFloat(r.gstOnCommission),
    tcsAmount: parseFloat(r.tcsAmount),
    tdsAmount: parseFloat(r.tdsAmount),
    mdrCharges: parseFloat(r.mdrCharges),
    penalty: parseFloat(r.penalty),
    netPayable: parseFloat(r.netPayable),
    status: r.status,
    financeNotes: r.financeNotes,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

export default router;
