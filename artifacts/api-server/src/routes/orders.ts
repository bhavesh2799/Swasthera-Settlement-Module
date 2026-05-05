import { Router } from "express";
import { db } from "@workspace/db";
import { bagsTable, onboardingsTable } from "@workspace/db";
import { eq, and, like, SQL } from "drizzle-orm";
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
      ? await db.select().from(bagsTable).where(and(...conditions)).orderBy(bagsTable.createdAt).limit(200)
      : await db.select().from(bagsTable).orderBy(bagsTable.createdAt).limit(200);

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

// Fynd simulator: create a new bag/order entry
router.post("/bags", async (req, res) => {
  try {
    const body = req.body as {
      brandId: number;
      brandName: string;
      cycle: string;
      sku: string;
      esp: number;
      qty?: number;
      omsState?: string;
      deliveryDate?: string;
      tcsAmount?: number;
      tdsAmount?: number;
      eligibility?: string;
      stateCode?: string;
      stateGstin?: string;
    };

    if (!body.brandId || !body.brandName || !body.cycle || !body.sku || !body.esp) {
      return res.status(400).json({ error: "Missing required fields: brandId, brandName, cycle, sku, esp" });
    }

    // Auto-generate IDs that look like Fynd bag/order refs
    const ts = Date.now();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const bagId = `BAG${ts}${rand}`;
    const orderId = `ORD${ts}${Math.floor(Math.random() * 900) + 100}`;

    const qty = body.qty ?? 1;
    const esp = body.esp;
    const deliveryDate = body.deliveryDate ?? new Date().toISOString().split("T")[0];

    // Fetch brand for stateCode/GSTIN if not provided
    let stateCode = body.stateCode ?? "27";
    let stateGstin = body.stateGstin ?? "";
    if (!body.stateCode) {
      const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, body.brandId));
      if (ob) {
        stateCode = ob.stateCode ?? ob.masterGstin?.substring(0, 2) ?? "27";
        stateGstin = ob.warehouseGstin ?? ob.masterGstin ?? "";
      }
    }

    const windowDays = 7;
    const deliveryDt = new Date(deliveryDate);
    const windowExpiryDate = new Date(deliveryDt.getTime() + windowDays * 24 * 3600 * 1000).toISOString().split("T")[0];
    const invoiceDate = new Date(deliveryDt.getTime() - 2 * 24 * 3600 * 1000).toISOString().split("T")[0];

    const [row] = await db.insert(bagsTable).values({
      bagId,
      orderId,
      brandId: body.brandId,
      brandName: body.brandName,
      sku: body.sku,
      esp: String(esp),
      qty,
      omsState: body.omsState ?? "delivery_done",
      invoiceDate,
      deliveryDate,
      windowExpiryDate,
      tcsAmount: String(body.tcsAmount ?? 0),
      tdsAmount: String(body.tdsAmount ?? 0),
      eligibility: (body.eligibility ?? "eligible") as "eligible" | "in_window" | "on_hold" | "settled" | "awaiting_delivery",
      cycle: body.cycle,
      stateCode,
      stateGstin,
    }).returning();

    res.status(201).json(mapBag(row));
  } catch (err) {
    req.log.error({ err }, "create bag error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fynd simulator: update a bag's eligibility or fields
router.put("/bags/:id", async (req, res) => {
  try {
    const body = req.body as { eligibility?: string };
    const updates: Partial<typeof bagsTable.$inferInsert> = {};

    if (body.eligibility) {
      updates.eligibility = body.eligibility as "eligible" | "in_window" | "on_hold" | "settled" | "awaiting_delivery";
    }

    const [row] = await db.update(bagsTable)
      .set(updates)
      .where(eq(bagsTable.id, parseInt(req.params.id)))
      .returning();

    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapBag(row));
  } catch (err) {
    req.log.error({ err }, "update bag error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fynd simulator: delete a bag
router.delete("/bags/:id", async (req, res) => {
  try {
    const [row] = await db.delete(bagsTable)
      .where(eq(bagsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true, id: row.id });
  } catch (err) {
    req.log.error({ err }, "delete bag error");
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
