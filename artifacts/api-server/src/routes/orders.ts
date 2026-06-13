import { Router } from "express";
import { db } from "@workspace/db";
import { bagsTable, invoicesTable, onboardingsTable, brandsTable, warehousesTable } from "@workspace/db";
import { eq, and, like, lt, inArray, SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { reversalDeadline, isPastReversalDeadline, canReverseTDS } from "../services/tdsReversalService";
import { generateInvoice } from "../services/invoiceService";
import { authorize } from "../middlewares/rbac";

const router = Router();

router.get("/orders", async (req, res) => {
  try {
    const { brand_id, oms_state, eligibility, cycle, search } = req.query as Record<string, string>;
    const conditions: SQL[] = [];
    if (brand_id) conditions.push(eq(bagsTable.brandId, parseInt(brand_id)));
    if (oms_state) conditions.push(eq(bagsTable.omsState, oms_state));
    if (eligibility && eligibility !== "all") {
      const today = new Date().toISOString().split("T")[0];
      if (eligibility === "eligible") {
        // Bag is truly eligible when its return window has expired — mirrors display logic
        conditions.push(sql`(${bagsTable.eligibility} IN ('eligible', 'in_window') AND (${bagsTable.windowExpiryDate} IS NULL OR ${bagsTable.windowExpiryDate} < ${today}))`);
      } else if (eligibility === "in_window") {
        // Bag is in-window when the return window is still open — mirrors display logic
        conditions.push(sql`(${bagsTable.eligibility} IN ('eligible', 'in_window') AND ${bagsTable.windowExpiryDate} IS NOT NULL AND ${bagsTable.windowExpiryDate} >= ${today})`);
      } else {
        conditions.push(eq(bagsTable.eligibility, eligibility as "on_hold" | "settled" | "awaiting_delivery"));
      }
    }
    if (cycle) conditions.push(eq(bagsTable.cycle, cycle));
    if (search) conditions.push(like(bagsTable.bagId, `%${search}%`));

    const bags = conditions.length > 0
      ? await db.select().from(bagsTable).where(and(...conditions)).orderBy(bagsTable.createdAt).limit(200)
      : await db.select().from(bagsTable).orderBy(bagsTable.createdAt).limit(200);

    const statToday = new Date().toISOString().split("T")[0];
    const [totals] = await db
      .select({
        totalBags: sql<string>`count(*)`,
        totalEsp: sql<string>`coalesce(sum(${bagsTable.esp}), 0)`,
        totalQty: sql<string>`coalesce(sum(${bagsTable.qty}), 0)`,
        totalTcs: sql<string>`coalesce(sum(${bagsTable.tcsAmount}), 0)`,
        totalTds: sql<string>`coalesce(sum(${bagsTable.tdsAmount}), 0)`,
        eligibleCount: sql<string>`count(*) filter (where ${bagsTable.eligibility} IN ('eligible', 'in_window') AND (${bagsTable.windowExpiryDate} IS NULL OR ${bagsTable.windowExpiryDate} < ${statToday}))`,
        inWindowCount: sql<string>`count(*) filter (where ${bagsTable.eligibility} IN ('eligible', 'in_window') AND ${bagsTable.windowExpiryDate} IS NOT NULL AND ${bagsTable.windowExpiryDate} >= ${statToday})`,
        onHoldCount: sql<string>`count(*) filter (where ${bagsTable.eligibility} = 'on_hold')`,
      })
      .from(bagsTable);

    return res.json({
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
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.id, parseInt(String(req.params.id))));
    if (!bag) return res.status(404).json({ error: "Not found" });
    return res.json({
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
    return res.status(500).json({ error: "Internal server error" });
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
      warehouseId?: number;
    };

    if (!body.brandId || !body.brandName || !body.cycle || !body.sku || !body.esp) {
      return res.status(400).json({ error: "Missing required fields: brandId, brandName, cycle, sku, esp" });
    }

    const ts = Date.now();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const bagId = `BAG${ts}${rand}`;
    const orderId = `ORD${ts}${Math.floor(Math.random() * 900) + 100}`;

    const qty = body.qty ?? 1;
    const esp = body.esp;
    const deliveryDate = body.deliveryDate ?? new Date().toISOString().split("T")[0];

    // Fetch brand for stateCode, GSTIN, and returnWindowDays
    let stateCode = body.stateCode ?? "27";
    let stateGstin = body.stateGstin ?? "";
    let returnWindowDays = 7;
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, body.brandId));
    if (ob) {
      stateCode = body.stateCode ?? ob.stateCode ?? ob.masterGstin?.substring(0, 2) ?? "27";
      stateGstin = body.stateGstin ?? ob.warehouseGstin ?? ob.masterGstin ?? "";
      returnWindowDays = ob.returnWindowDays ?? 7;
    }
    // Prefer warehouse table data (more accurate — CO → BR → WH hierarchy).
    // Also resolve the warehouse the bag ships from for settlement routing
    // (Task #11): an explicit body.warehouseId wins, else the primary warehouse.
    let warehouseId: number | null = body.warehouseId ?? null;
    if (warehouseId != null) {
      const [explicitWh] = await db.select().from(warehousesTable)
        .where(and(eq(warehousesTable.id, warehouseId), eq(warehousesTable.onboardingId, body.brandId)))
        .limit(1);
      if (explicitWh) {
        stateCode = body.stateCode ?? explicitWh.stateCode ?? stateCode;
        stateGstin = body.stateGstin ?? explicitWh.warehouseGstin ?? stateGstin;
      } else {
        warehouseId = null; // ignore a warehouse that doesn't belong to this brand
      }
    }
    if (warehouseId == null) {
      const [primaryBrand] = await db.select().from(brandsTable)
        .where(eq(brandsTable.onboardingId, body.brandId))
        .orderBy(brandsTable.createdAt)
        .limit(1);
      if (primaryBrand) {
        const [primaryWarehouse] = await db.select().from(warehousesTable)
          .where(and(
            eq(warehousesTable.brandId, primaryBrand.id),
            eq(warehousesTable.isPrimary, true),
            eq(warehousesTable.status, "ACTIVE"),
            eq(warehousesTable.isActive, true),
          ))
          .limit(1);
        if (primaryWarehouse) {
          warehouseId = primaryWarehouse.id;
          stateCode = body.stateCode ?? primaryWarehouse.stateCode ?? stateCode;
          stateGstin = body.stateGstin ?? primaryWarehouse.warehouseGstin ?? stateGstin;
        }
      }
    }

    const deliveryDt = new Date(deliveryDate);
    const windowExpiryDate = new Date(deliveryDt.getTime() + returnWindowDays * 24 * 3600 * 1000).toISOString().split("T")[0];
    const invoiceDate = new Date(deliveryDt.getTime() - 2 * 24 * 3600 * 1000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    // Auto-calculate eligibility based on return window unless explicitly provided
    let eligibility = body.eligibility ?? (windowExpiryDate < today ? "eligible" : "in_window");

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
      eligibility: eligibility as "eligible" | "in_window" | "on_hold" | "settled" | "awaiting_delivery",
      cycle: body.cycle,
      stateCode,
      stateGstin,
      warehouseId,
    }).returning();

    return res.status(201).json(mapBag(row));
  } catch (err) {
    req.log.error({ err }, "create bag error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/** Accepts YYYY-MM-DD or DD-MM-YYYY and always returns YYYY-MM-DD. */
function normaliseDate(dateStr: string | undefined, fallback: string): string {
  if (!dateStr) return fallback;
  const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateStr);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  // DD/MM/YYYY
  const ddmmyyyySlash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
  if (ddmmyyyySlash) return `${ddmmyyyySlash[3]}-${ddmmyyyySlash[2]}-${ddmmyyyySlash[1]}`;
  return dateStr;
}

// Fynd simulator: bulk create bags from CSV upload
router.post("/bags/bulk", async (req, res) => {
  try {
    const { bags } = req.body as { bags: Array<{
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
    }> };

    if (!Array.isArray(bags) || bags.length === 0) {
      return res.status(400).json({ error: "bags array is required and must not be empty" });
    }
    if (bags.length > 500) {
      return res.status(400).json({ error: "Maximum 500 bags per bulk upload" });
    }

    // Resolve BR-XXXXX brand codes to onboarding IDs
    const rawBrandIds = [...new Set(bags.map((b) => b.brandId))];
    const brandCodeIds = rawBrandIds.filter((id) => typeof id === "string" && String(id).startsWith("BR-"));
    const resolvedCodeMap = new Map<string, number>(); // BR-XXXXX → onboarding_id
    if (brandCodeIds.length > 0) {
      const brandRows = await db.select().from(brandsTable)
        .where(sql`${brandsTable.brandCode} = ANY(ARRAY[${sql.join(brandCodeIds.map((c) => sql`${String(c)}`), sql`, `)}])`);
      for (const br of brandRows) {
        if (br.brandCode) resolvedCodeMap.set(br.brandCode, br.onboardingId);
      }
    }
    // Normalise all bag entries to use numeric onboarding IDs
    const normalisedBags = bags.map((b) => ({
      ...b,
      brandId: typeof b.brandId === "string" && String(b.brandId).startsWith("BR-")
        ? (resolvedCodeMap.get(String(b.brandId)) ?? b.brandId)
        : b.brandId,
    }));

    // Prefetch all unique (numeric) brand onboarding records
    const brandIds = [...new Set(
      normalisedBags
        .map((b) => b.brandId)
        .filter((id): id is number => typeof id === "number" || (!isNaN(Number(id)) && id !== ""))
        .map(Number)
    )];
    const brands = brandIds.length > 0
      ? await db.select().from(onboardingsTable).where(inArray(onboardingsTable.id, brandIds))
      : [];
    const brandMap = new Map(brands.map((b) => [b.id, b]));

    // Primary warehouse per onboarding for settlement routing (Task #11).
    const primaryWarehouses = brandIds.length > 0
      ? await db.select().from(warehousesTable).where(and(
          inArray(warehousesTable.onboardingId, brandIds),
          eq(warehousesTable.isPrimary, true),
          eq(warehousesTable.status, "ACTIVE"),
          eq(warehousesTable.isActive, true),
        ))
      : [];
    const primaryWarehouseByOnboarding = new Map(primaryWarehouses.map((w) => [w.onboardingId, w.id]));

    const today = new Date().toISOString().split("T")[0];
    const ts = Date.now();

    const inserted = await Promise.all(normalisedBags.map(async (b, i) => {
      const brand = brandMap.get(Number(b.brandId));
      const returnWindowDays = brand?.returnWindowDays ?? 7;
      const deliveryDate = normaliseDate(b.deliveryDate, today);
      const deliveryDt = new Date(deliveryDate);
      const windowExpiryDate = new Date(deliveryDt.getTime() + returnWindowDays * 24 * 3600 * 1000).toISOString().split("T")[0];
      const invoiceDate = new Date(deliveryDt.getTime() - 2 * 24 * 3600 * 1000).toISOString().split("T")[0];
      const eligibility = b.eligibility ?? (windowExpiryDate < today ? "eligible" : "in_window");
      const rand = i * 100 + Math.floor(Math.random() * 99);

      const [row] = await db.insert(bagsTable).values({
        bagId: `BAG${ts}${rand.toString().padStart(4, "0")}`,
        orderId: `ORD${ts}${rand.toString().padStart(3, "0")}`,
        brandId: Number(b.brandId),
        brandName: b.brandName,
        sku: b.sku,
        esp: String(b.esp),
        qty: b.qty ?? 1,
        omsState: b.omsState ?? "delivery_done",
        invoiceDate,
        deliveryDate,
        windowExpiryDate,
        tcsAmount: String(b.tcsAmount ?? 0),
        tdsAmount: String(b.tdsAmount ?? 0),
        eligibility: eligibility as "eligible" | "in_window" | "on_hold" | "settled" | "awaiting_delivery",
        cycle: b.cycle,
        stateCode: (() => {
          // Use warehouse table if available
          return brand?.stateCode ?? brand?.masterGstin?.substring(0, 2) ?? "27";
        })(),
        stateGstin: brand?.warehouseGstin ?? brand?.masterGstin ?? "",
        warehouseId: primaryWarehouseByOnboarding.get(Number(b.brandId)) ?? null,
      }).returning();
      return row;
    }));

    return res.status(201).json({ created: inserted.length, bags: inserted.map(mapBag) });
  } catch (err) {
    req.log.error({ err }, "bulk create bags error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Fynd simulator: recalculate eligibility — move in_window bags to eligible where window has expired
router.post("/bags/recalculate-eligibility", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const updated = await db.update(bagsTable)
      .set({ eligibility: "eligible" })
      .where(and(
        eq(bagsTable.eligibility, "in_window"),
        lt(bagsTable.windowExpiryDate, today),
      ))
      .returning();

    return res.json({ updated: updated.length, message: `${updated.length} bag(s) moved from In-Window to Eligible` });
  } catch (err) {
    req.log.error({ err }, "recalculate eligibility error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Fynd simulator: update a bag's eligibility
router.put("/bags/:id", async (req, res) => {
  try {
    const body = req.body as { eligibility?: string };
    const updates: Partial<typeof bagsTable.$inferInsert> = {};
    if (body.eligibility) {
      updates.eligibility = body.eligibility as "eligible" | "in_window" | "on_hold" | "settled" | "awaiting_delivery";
    }
    const [row] = await db.update(bagsTable).set(updates).where(eq(bagsTable.id, parseInt(String(req.params.id)))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(mapBag(row));
  } catch (err) {
    req.log.error({ err }, "update bag error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /bags/:id/set-scenario
 * Resets a bag to one of the canonical return/cancellation states so any of
 * the 5 BRD reversal cases can be demonstrated from the UI without SQL access.
 *
 * body: { scenario: 1 | 2 | 4, pastDeadline?: boolean }
 *   scenario 1  — pre-delivery cancel
 *   scenario 2  — in-window return (accept = Case 2, reject = Case 3)
 *   scenario 4  — past-window rejection (always has expired deadline)
 *   pastDeadline — set invoice date to prior month so TDS is NOT reversible
 *
 * Side-effects: deletes any existing invoices for the order and re-captures a
 * fresh one (sequential, not parallel, to avoid invoice-number race condition).
 */
router.post("/bags/:id/set-scenario", authorize(["backend", "admin"]), async (req, res) => {
  try {
    const bagId = parseInt(String(req.params.id));
    const { scenario, pastDeadline = false } = req.body as { scenario: 1 | 2 | 4; pastDeadline?: boolean };

    if (![1, 2, 4].includes(scenario)) {
      return res.status(400).json({ error: "scenario must be 1, 2, or 4" });
    }

    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.id, bagId)).limit(1);
    if (!bag) return res.status(404).json({ error: "Bag not found" });

    const todayDt = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const dAgo = (days: number) => {
      const d = new Date(todayDt);
      d.setDate(d.getDate() - days);
      return fmtDate(d);
    };
    const dAhead = (days: number) => {
      const d = new Date(todayDt);
      d.setDate(d.getDate() + days);
      return fmtDate(d);
    };

    // Prior-month 15th — puts the TDS deposit deadline in the past (7th of this month).
    const priorMonth15th = (() => {
      const d = new Date(todayDt);
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      d.setDate(15);
      return fmtDate(d);
    })();

    let deliveryDate: string | null;
    let windowExpiryDate: string | null;
    let omsState: string;
    let eligibility: "awaiting_delivery" | "in_window" | "eligible";
    let invoiceDate: string;

    if (scenario === 1) {
      // Case 1 — pre-delivery: not yet dispatched.
      deliveryDate = null;
      windowExpiryDate = null;
      omsState = "bag_confirmed";
      eligibility = "awaiting_delivery";
      invoiceDate = pastDeadline ? priorMonth15th : fmtDate(todayDt);
    } else if (scenario === 2) {
      // Cases 2 & 3 — delivered, return window still open (15-day window).
      deliveryDate = dAgo(7);
      windowExpiryDate = dAhead(8);          // 8 days left
      omsState = "delivered";
      eligibility = "in_window";
      invoiceDate = pastDeadline ? priorMonth15th : dAgo(9);
    } else {
      // Case 4 — past return window; TDS deadline inherently expired.
      deliveryDate = dAgo(45);
      windowExpiryDate = dAgo(30);
      omsState = "delivered";
      eligibility = "eligible";
      invoiceDate = dAgo(47);                // always past the 7th deadline
    }

    // Wipe existing invoices so we can re-capture a clean one.
    await db.delete(invoicesTable).where(eq(invoicesTable.orderId, bag.orderId));

    const [updated] = await db
      .update(bagsTable)
      .set({
        deliveryDate,
        windowExpiryDate,
        invoiceDate,
        omsState,
        eligibility,
        reversalStatus: null,
        reversalReason: null,
      })
      .where(eq(bagsTable.id, bagId))
      .returning();

    const invoice = await generateInvoice(bag.orderId);

    const txnDate = new Date(invoiceDate);
    return res.json({
      scenario,
      pastDeadline,
      bag: mapBag(updated),
      invoice: { invoiceNumber: invoice.invoiceNumber, netPayable: invoice.netPayable },
      reversalEligible: canReverseTDS(txnDate, new Date()),
      reversalDeadline: reversalDeadline(txnDate),
    });
  } catch (err) {
    req.log.error({ err }, "set-scenario failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : "set-scenario failed" });
  }
});

// Fynd simulator: delete a bag
router.delete("/bags/:id", async (req, res) => {
  try {
    const [row] = await db.delete(bagsTable).where(eq(bagsTable.id, parseInt(String(req.params.id)))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({ deleted: true, id: row.id });
  } catch (err) {
    req.log.error({ err }, "delete bag error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function mapBag(b: typeof bagsTable.$inferSelect) {
  const txnDate = b.invoiceDate ? new Date(b.invoiceDate) : new Date(b.createdAt);
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
    reversalStatus: b.reversalStatus ?? null,
    reversalReason: b.reversalReason ?? null,
    reversalDeadline: reversalDeadline(txnDate),
    reversalDeadlinePast: isPastReversalDeadline(txnDate),
  };
}

export default router;
