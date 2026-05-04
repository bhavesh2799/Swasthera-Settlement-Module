import { Router } from "express";
import { db } from "@workspace/db";
import { bagsTable } from "@workspace/db";
import { eq, and, like, sum, count, SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/orders", async (req, res) => {
  try {
    const { brand_id, oms_state, eligibility, cycle, search } = req.query as Record<string, string>;
    const conditions: SQL[] = [];
    if (brand_id) conditions.push(eq(bagsTable.brandId, parseInt(brand_id)));
    if (oms_state) conditions.push(eq(bagsTable.omsState, oms_state));
    if (eligibility && eligibility !== "all") {
      conditions.push(eq(bagsTable.eligibility, eligibility as "eligible" | "in_window" | "on_hold" | "settled" | "awaiting_delivery"));
    }
    if (cycle) conditions.push(eq(bagsTable.cycle, cycle));
    if (search) conditions.push(like(bagsTable.bagId, `%${search}%`));

    const bags = conditions.length > 0
      ? await db.select().from(bagsTable).where(and(...conditions)).limit(200)
      : await db.select().from(bagsTable).limit(200);

    const [totals] = await db
      .select({
        totalBags: sql<string>`count(*)`,
        totalEsp: sql<string>`coalesce(sum(${bagsTable.esp}), 0)`,
        totalQty: sql<string>`coalesce(sum(${bagsTable.qty}), 0)`,
        totalTcs: sql<string>`coalesce(sum(${bagsTable.tcsAmount}), 0)`,
        totalTds: sql<string>`coalesce(sum(${bagsTable.tdsAmount}), 0)`,
        eligibleCount: sql<string>`count(*) filter (where ${bagsTable.eligibility} = 'eligible')`,
        inWindowCount: sql<string>`count(*) filter (where ${bagsTable.eligibility} = 'in_window')`,
        onHoldCount: sql<string>`count(*) filter (where ${bagsTable.eligibility} = 'on_hold')`,
      })
      .from(bagsTable);

    res.json({
      bags: bags.map(mapBag),
      totals: {
        totalBags: parseInt(totals?.totalBags ?? "0"),
        totalEsp: parseFloat(totals?.totalEsp ?? "0"),
        totalQty: parseInt(totals?.totalQty ?? "0"),
        totalTcs: parseFloat(totals?.totalTcs ?? "0"),
        totalTds: parseFloat(totals?.totalTds ?? "0"),
        eligibleCount: parseInt(totals?.eligibleCount ?? "0"),
        inWindowCount: parseInt(totals?.inWindowCount ?? "0"),
        onHoldCount: parseInt(totals?.onHoldCount ?? "0"),
      },
    });
  } catch (err) {
    req.log.error({ err }, "list orders error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.id, parseInt(req.params.id)));
    if (!bag) return res.status(404).json({ error: "Not found" });
    res.json({
      ...mapBag(bag),
      omsTimeline: [
        { state: "bag_created", critical: false },
        { state: "payment_confirmed", critical: false },
        { state: "invoice_generated", critical: true },
        { state: "shipped", critical: false },
        { state: bag.omsState, critical: true },
      ],
      commissionRate: 5.5,
      commissionRateLockDate: bag.invoiceDate ?? "",
      invoicedAt: bag.invoiceDate ?? "",
      tcsAccruedAt: bag.deliveryDate ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "get order error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapBag(b: typeof bagsTable.$inferSelect) {
  return {
    id: b.id,
    bagId: b.bagId,
    orderId: b.orderId,
    brandName: b.brandName,
    brandId: b.brandId,
    sku: b.sku,
    esp: parseFloat(b.esp),
    qty: b.qty,
    omsState: b.omsState,
    invoiceDate: b.invoiceDate ?? "",
    deliveryDate: b.deliveryDate ?? "",
    windowExpiryDate: b.windowExpiryDate ?? "",
    tcsAmount: parseFloat(b.tcsAmount),
    tdsAmount: parseFloat(b.tdsAmount),
    eligibility: b.eligibility,
    cycle: b.cycle,
    stateCode: b.stateCode,
    stateGstin: b.stateGstin,
  };
}

export default router;
