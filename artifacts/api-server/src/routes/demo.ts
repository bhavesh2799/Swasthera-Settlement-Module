import { Router } from "express";
import { db, bagsTable, invoicesTable, tcsRecordsTable, tdsRecordsTable, onboardingsTable, brandsTable, warehousesTable } from "@workspace/db";
import { like, sql, eq, and } from "drizzle-orm";
import { generateInvoice } from "../services/invoiceService";
import { authorize } from "../middlewares/rbac";

const router = Router();

/**
 * The pristine state for the 3 demo bags that drive the 4 reversal scenarios.
 * Bag 02 (DEMO-RETURN-INWINDOW) serves BOTH scenario 2a (accept) and 2b (reject).
 * Delivery/window dates are fixed to the original seed values; the reset preserves
 * the scenario logic regardless of today's date (window_expiry_date is always set
 * relative to its original delivery date, not today).
 */
const DEMO_BAGS = [
  {
    bagId: "DEMO-BAG-01",
    orderId: "DEMO-PREDELIVERY-CANCEL",
    brandId: 2,
    brandName: "Zara India",
    sku: "ZAR-DEMO-001",
    esp: "4000.00" as const,
    qty: 1,
    omsState: "bag_confirmed",
    invoiceDate: "2026-06-12",
    deliveryDate: null as string | null,   // NULL = not yet delivered → Scenario 1
    windowExpiryDate: null as string | null,
    tcsAmount: "40.00" as const,
    tdsAmount: "40.00" as const,
    eligibility: "awaiting_delivery" as const,
    cycle: "JUN-2026-DEMO",
    stateCode: "27",
    stateGstin: "27AAACZ1234A1Z5",
    customerName: "Demo Customer A",
    customerAddress: "123 MG Road, Mumbai",
    customerState: "Maharashtra",
    customerStateCode: "27",
    paymentMethod: "PREPAID",
    reversalStatus: null as string | null,
    reversalReason: null as string | null,
  },
  {
    bagId: "DEMO-BAG-02",
    orderId: "DEMO-RETURN-INWINDOW",
    brandId: 2,
    brandName: "Zara India",
    sku: "ZAR-DEMO-002",
    esp: "4000.00" as const,
    qty: 1,
    omsState: "delivered",
    invoiceDate: "2026-06-03",
    deliveryDate: "2026-06-05",            // delivered; 15-day window open → Scenario 2a/2b
    windowExpiryDate: "2026-06-20",
    tcsAmount: "40.00" as const,
    tdsAmount: "40.00" as const,
    eligibility: "in_window" as const,
    cycle: "JUN-2026-DEMO",
    stateCode: "27",
    stateGstin: "27AAACZ1234A1Z5",
    customerName: "Demo Customer B",
    customerAddress: "456 Linking Road, Mumbai",
    customerState: "Maharashtra",
    customerStateCode: "27",
    paymentMethod: "PREPAID",
    reversalStatus: null as string | null,
    reversalReason: null as string | null,
  },
  {
    bagId: "DEMO-BAG-03",
    orderId: "DEMO-RETURN-PASTWINDOW",
    brandId: 2,
    brandName: "Zara India",
    sku: "ZAR-DEMO-003",
    esp: "4000.00" as const,
    qty: 1,
    omsState: "delivered",
    invoiceDate: "2026-05-18",
    deliveryDate: "2026-05-20",            // window expired June 4, reversal deadline was June 7 → Scenario 3
    windowExpiryDate: "2026-06-04",
    tcsAmount: "40.00" as const,
    tdsAmount: "40.00" as const,
    eligibility: "eligible" as const,
    cycle: "MAY-2026-DEMO",
    stateCode: "27",
    stateGstin: "27AAACZ1234A1Z5",
    customerName: "Demo Customer C",
    customerAddress: "789 Pedder Road, Mumbai",
    customerState: "Maharashtra",
    customerStateCode: "27",
    paymentMethod: "PREPAID",
    reversalStatus: null as string | null,
    reversalReason: null as string | null,
  },
] as const;

/**
 * POST /demo/reset
 * Wipes and re-seeds the 3 demo reversal bags (+ their invoices and any reversal
 * TCS/TDS entries created during previous demo runs) so all 4 reversal scenarios
 * can be demonstrated from a clean slate.  Requires Backend role.
 */
router.post("/demo/reset", authorize(["backend", "admin"]), async (req, res) => {
  try {
    // 1. Remove any reversal TCS / TDS rows written for the demo bags.
    await db.delete(tcsRecordsTable).where(like(tcsRecordsTable.originalBagId, "DEMO-BAG-%"));
    await db.delete(tdsRecordsTable).where(like(tdsRecordsTable.originalBagId, "DEMO-BAG-%"));

    // 2. Remove existing invoices so we can re-capture fresh ones.
    await db.delete(invoicesTable).where(like(invoicesTable.orderId, "DEMO-%"));

    // 3. Upsert the 3 bags back to pristine state.  We update every column so
    //    any mid-demo mutations (oms_state, reversal_status, eligibility, etc.) are reset.
    for (const bag of DEMO_BAGS) {
      await db
        .insert(bagsTable)
        .values(bag)
        .onConflictDoUpdate({
          target: bagsTable.bagId,
          set: {
            omsState: bag.omsState,
            invoiceDate: bag.invoiceDate,
            deliveryDate: sql`excluded.delivery_date`,
            windowExpiryDate: sql`excluded.window_expiry_date`,
            tcsAmount: bag.tcsAmount,
            tdsAmount: bag.tdsAmount,
            eligibility: bag.eligibility,
            reversalStatus: null,
            reversalReason: null,
          },
        });
    }

    // 4. Re-capture invoices for all 3 bags — sequential to avoid invoice-number
    //    race condition (generateInvoice reads MAX(invoice_number) then inserts).
    const invoices: Awaited<ReturnType<typeof generateInvoice>>[] = [];
    for (const bag of DEMO_BAGS) {
      invoices.push(await generateInvoice(bag.orderId));
    }

    req.log.info({ bags: DEMO_BAGS.map((b) => b.orderId) }, "demo bags reset");
    return res.json({
      message: "Demo reversal bags reset to pristine state.",
      bags: DEMO_BAGS.map((b, i) => ({
        orderId: b.orderId,
        scenario: i === 0 ? "1 — Pre-delivery cancellation" : i === 1 ? "2a/2b — In-window return (accept or reject)" : "3 — Past-window rejection",
        invoice: invoices[i].invoiceNumber,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "demo reset failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : "reset failed" });
  }
});

// ─── Demo Order Factory ───────────────────────────────────────────────────────

const SKU_POOL = [
  "SHIRT-WHT-M", "SHIRT-BLK-L", "SHIRT-BLU-XL", "SHIRT-RED-S",
  "DRESS-RED-M", "DRESS-BLU-S", "DRESS-GRN-L", "DRESS-BLK-XL",
  "JEANS-BLK-32", "JEANS-BLU-34", "JEANS-GRY-30", "JEANS-DRK-36",
  "KURTI-RED-M", "KURTI-GRN-L", "KURTI-YLW-XL", "KURTI-PNK-S",
  "SAREE-SLK-STD", "SAREE-CTN-STD", "LEHENGA-GLD-M", "DUPATTA-RED-STD",
  "JACKET-BLK-L", "JACKET-BRN-XL", "BLAZER-NVY-40", "COAT-GRY-42",
  "SHOES-BLK-8", "SHOES-BRN-9", "SANDAL-TAN-7", "SNEAKER-WHT-10",
  "BAG-LTH-BRN", "BAG-CAN-BLK", "WALLET-BRN-STD", "BELT-BLK-34",
] as const;

const ESP_POOL = [499, 799, 999, 1299, 1499, 1999, 2499, 2999, 3499, 3999, 4499, 4999];

const CUSTOMER_NAMES = [
  "Priya Sharma", "Rahul Gupta", "Anjali Singh", "Vikram Mehta",
  "Sunita Patel", "Arun Kumar", "Meera Nair", "Deepak Joshi",
  "Kavita Reddy", "Sanjay Verma", "Pooja Iyer", "Nikhil Desai",
];

const CUSTOMER_ADDRESSES = [
  "12 MG Road, Bengaluru, Karnataka",
  "45 Linking Road, Mumbai, Maharashtra",
  "78 Connaught Place, New Delhi, Delhi",
  "23 Park Street, Kolkata, West Bengal",
  "56 Anna Salai, Chennai, Tamil Nadu",
  "34 Banjara Hills, Hyderabad, Telangana",
  "90 Law Garden, Ahmedabad, Gujarat",
  "15 Civil Lines, Jaipur, Rajasthan",
];

const STATE_NAMES: Record<string, string> = {
  "07": "Delhi", "27": "Maharashtra", "29": "Karnataka",
  "33": "Tamil Nadu", "36": "Telangana", "24": "Gujarat",
  "08": "Rajasthan", "19": "West Bengal",
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

interface StageCfg {
  omsState: string;
  eligibility: "awaiting_delivery" | "in_window" | "eligible" | "on_hold" | "settled";
  deliveryDate: string | null;
  invoiceDate: string;
  windowExpiryDate: string | null;
  reversalStatus: string | null;
  needsInvoice: boolean;
}

function buildStage(stage: string, returnWindowDays: number): StageCfg {
  switch (stage) {
    case "awaiting_delivery":
      return {
        omsState: "bag_confirmed", eligibility: "awaiting_delivery",
        deliveryDate: null, invoiceDate: daysAgo(1), windowExpiryDate: null,
        reversalStatus: null, needsInvoice: false,
      };
    case "in_window": {
      const del = daysAgo(3);
      return {
        omsState: "delivered", eligibility: "in_window",
        deliveryDate: del, invoiceDate: daysAgo(4),
        windowExpiryDate: addDays(del, returnWindowDays),
        reversalStatus: null, needsInvoice: true,
      };
    }
    case "eligible": {
      const del = daysAgo(30);
      return {
        omsState: "delivered", eligibility: "eligible",
        deliveryDate: del, invoiceDate: daysAgo(31),
        windowExpiryDate: addDays(del, returnWindowDays),
        reversalStatus: null, needsInvoice: true,
      };
    }
    case "on_hold": {
      const del = daysAgo(20);
      return {
        omsState: "delivered", eligibility: "on_hold",
        deliveryDate: del, invoiceDate: daysAgo(21),
        windowExpiryDate: addDays(del, returnWindowDays),
        reversalStatus: null, needsInvoice: true,
      };
    }
    case "settled": {
      const del = daysAgo(45);
      return {
        omsState: "delivered", eligibility: "settled",
        deliveryDate: del, invoiceDate: daysAgo(46),
        windowExpiryDate: addDays(del, returnWindowDays),
        reversalStatus: null, needsInvoice: true,
      };
    }
    case "cancelled":
      return {
        omsState: "cancelled", eligibility: "on_hold",
        deliveryDate: null, invoiceDate: daysAgo(5), windowExpiryDate: null,
        reversalStatus: "CANCELLED", needsInvoice: false,
      };
    case "return_accepted": {
      const del = daysAgo(10);
      return {
        omsState: "return_accepted", eligibility: "on_hold",
        deliveryDate: del, invoiceDate: daysAgo(11),
        windowExpiryDate: addDays(del, returnWindowDays),
        reversalStatus: "RETURNED", needsInvoice: true,
      };
    }
    case "return_rejected": {
      const del = daysAgo(35);
      return {
        omsState: "delivered", eligibility: "eligible",
        deliveryDate: del, invoiceDate: daysAgo(36),
        windowExpiryDate: addDays(del, returnWindowDays),
        reversalStatus: "WINDOW_EXPIRED_REJECTED", needsInvoice: true,
      };
    }
    default:
      throw new Error(`Unknown stage: ${stage}`);
  }
}

const VALID_STAGES = new Set([
  "awaiting_delivery", "in_window", "eligible", "on_hold",
  "settled", "cancelled", "return_accepted", "return_rejected",
]);

/**
 * POST /demo/seed-orders
 * Generates demo bags for an APPROVED/ACTIVE brand across a configurable set
 * of settlement lifecycle stages.  Useful for quickly populating the order
 * register so you can run settlements, compliance reports, or reversal demos
 * without a real Fynd feed.
 *
 * Body: { onboardingId, cycle, stages: [{ stage, count }] }
 * Supported stages: awaiting_delivery, in_window, eligible, on_hold, settled,
 *                   cancelled, return_accepted, return_rejected
 */
router.post("/demo/seed-orders", authorize(["backend", "admin"]), async (req, res) => {
  try {
    const body = req.body as {
      onboardingId: number;
      cycle: string;
      stages: Array<{ stage: string; count: number }>;
    };

    if (!body.onboardingId || !body.cycle || !Array.isArray(body.stages) || body.stages.length === 0) {
      return res.status(400).json({ error: "Required: onboardingId, cycle, stages[]" });
    }

    // Validate all stages before touching the DB
    for (const { stage, count } of body.stages) {
      if (!VALID_STAGES.has(stage)) {
        return res.status(400).json({ error: `Invalid stage: "${stage}"` });
      }
      if (count < 1 || count > 20) {
        return res.status(400).json({ error: `count must be 1–20 (got ${count} for "${stage}")` });
      }
    }

    // Look up the onboarding
    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, Number(body.onboardingId)));
    if (!ob) return res.status(404).json({ error: `No onboarding found for id ${body.onboardingId}` });
    if (ob.status !== "APPROVED" && ob.status !== "ACTIVE") {
      return res.status(422).json({ error: `Brand must be APPROVED or ACTIVE (current status: ${ob.status})` });
    }

    // Resolve stateCode/stateGstin from primary warehouse (same logic as POST /bags)
    let stateCode = ob.stateCode ?? ob.masterGstin?.substring(0, 2) ?? "27";
    let stateGstin = ob.warehouseGstin ?? ob.masterGstin ?? "";
    const returnWindowDays = ob.returnWindowDays ?? 14;
    const tcsRate = parseFloat(ob.tcsRate ?? "1") / 100;
    const tdsRate = parseFloat(ob.tdsRate ?? "1") / 100;

    const [primaryBrand] = await db.select().from(brandsTable)
      .where(eq(brandsTable.onboardingId, Number(body.onboardingId)))
      .orderBy(brandsTable.createdAt)
      .limit(1);
    if (primaryBrand) {
      const [warehouse] = await db.select().from(warehousesTable)
        .where(and(
          eq(warehousesTable.brandId, primaryBrand.id),
          eq(warehousesTable.isPrimary, true),
          eq(warehousesTable.status, "ACTIVE"),
          eq(warehousesTable.isActive, true),
        ))
        .limit(1);
      if (warehouse) {
        stateCode = warehouse.stateCode ?? stateCode;
        stateGstin = warehouse.warehouseGstin ?? stateGstin;
      }
    }

    const customerState = STATE_NAMES[stateCode] ?? "India";

    // Create bags stage by stage; capture invoices sequentially (no parallel — see race-condition note in MEMORY)
    const created: Array<{
      orderId: string; bagId: string; stage: string;
      eligibility: string; omsState: string; invoice: string | null;
    }> = [];

    for (const { stage, count } of body.stages) {
      const cfg = buildStage(stage, returnWindowDays);
      for (let i = 0; i < count; i++) {
        // Small jitter so bagId/orderId are unique even within the same stage loop
        await new Promise((r) => setTimeout(r, 2));
        const ts = Date.now();
        const rand = Math.floor(Math.random() * 9000) + 1000;
        const bagId = `BAG${ts}${rand}`;
        const orderId = `ORD${ts}${Math.floor(Math.random() * 900) + 100}`;
        const esp = pick(ESP_POOL);
        const cIdx = Math.floor(Math.random() * CUSTOMER_NAMES.length);

        await db.insert(bagsTable).values({
          bagId, orderId,
          brandId: body.onboardingId,
          brandName: ob.brandName,
          sku: pick(SKU_POOL),
          esp: String(esp),
          qty: 1,
          omsState: cfg.omsState,
          invoiceDate: cfg.invoiceDate,
          deliveryDate: cfg.deliveryDate,
          windowExpiryDate: cfg.windowExpiryDate,
          tcsAmount: (esp * tcsRate).toFixed(2),
          tdsAmount: (esp * tdsRate).toFixed(2),
          eligibility: cfg.eligibility,
          cycle: body.cycle,
          stateCode, stateGstin,
          customerName: CUSTOMER_NAMES[cIdx],
          customerAddress: CUSTOMER_ADDRESSES[cIdx % CUSTOMER_ADDRESSES.length],
          customerState,
          customerStateCode: stateCode,
          paymentMethod: Math.random() > 0.4 ? "PREPAID" : "COD",
          reversalStatus: cfg.reversalStatus,
        });

        let invoiceNum: string | null = null;
        if (cfg.needsInvoice) {
          const inv = await generateInvoice(orderId);
          invoiceNum = inv.invoiceNumber;
        }

        created.push({ orderId, bagId, stage, eligibility: cfg.eligibility, omsState: cfg.omsState, invoice: invoiceNum });
      }
    }

    req.log.info({ onboardingId: body.onboardingId, cycle: body.cycle, count: created.length }, "demo seed-orders");
    return res.json({
      message: `Created ${created.length} bag${created.length !== 1 ? "s" : ""} for ${ob.brandName} (${body.cycle})`,
      created: created.length,
      brandName: ob.brandName,
      cycle: body.cycle,
      bags: created,
    });
  } catch (err) {
    req.log.error({ err }, "demo seed-orders failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : "seed-orders failed" });
  }
});

export default router;
