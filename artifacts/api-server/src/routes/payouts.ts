import { Router } from "express";
import { db } from "@workspace/db";
import { payoutsTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/payouts", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = status
      ? await db.select().from(payoutsTable).where(eq(payoutsTable.status, status as "INITIATED" | "UTR_RECORDED" | "SETTLED")).orderBy(payoutsTable.initiatedAt)
      : await db.select().from(payoutsTable).orderBy(payoutsTable.initiatedAt);

    res.json(rows.map(mapPayout));
  } catch (err) {
    req.log.error({ err }, "list payouts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/payouts/:id/record-utr", async (req, res) => {
  try {
    const { utr, bankAckAt, amountCredited } = req.body as { utr: string; bankAckAt: string; amountCredited: number };
    const [row] = await db.update(payoutsTable)
      .set({ utr, bankAckAt: new Date(bankAckAt), status: "UTR_RECORDED", settledAt: new Date() })
      .where(eq(payoutsTable.id, parseInt(req.params.id)))
      .returning();

    if (!row) return res.status(404).json({ error: "Not found" });

    await db.update(payoutsTable).set({ status: "SETTLED" }).where(eq(payoutsTable.id, row.id));
    const [settled] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, row.id));

    await db.insert(activityTable).values({ user: "Anjali Patel", action: `UTR recorded for ${row.brandName} — ${utr} (₹${amountCredited.toLocaleString()})`, entityType: "payout", entityRef: String(row.id), level: "success" });

    res.json(mapPayout(settled));
  } catch (err) {
    req.log.error({ err }, "record utr error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapPayout(p: typeof payoutsTable.$inferSelect) {
  return {
    id: p.id,
    settlementId: p.settlementId,
    cycle: p.cycle,
    companyName: p.companyName,
    brandName: p.brandName,
    bankAccount: p.bankAccount,
    bankIfsc: p.bankIfsc,
    bankName: p.bankName,
    amount: parseFloat(p.amount),
    transferMode: p.transferMode,
    paymentRef: p.paymentRef,
    utr: p.utr,
    bankAckAt: p.bankAckAt?.toISOString(),
    status: p.status,
    initiatedAt: p.initiatedAt.toISOString(),
    settledAt: p.settledAt?.toISOString(),
    bagCount: p.bagCount,
    bagIds: JSON.parse(p.bagIds) as string[],
  };
}

export default router;
