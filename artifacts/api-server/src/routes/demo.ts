import { Router } from "express";
import { db, bagsTable, invoicesTable, tcsRecordsTable, tdsRecordsTable } from "@workspace/db";
import { like, sql } from "drizzle-orm";
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

export default router;
