import { Router } from "express";
import { db, bagsTable, invoicesTable, tcsRecordsTable, tdsRecordsTable, activityTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authorize } from "../middlewares/rbac";
import { writeAudit } from "../services/audit";
import { generateInvoice, generateCreditNote, renderInvoiceHtml } from "../services/invoiceService";
import {
  canReverseTDS,
  classifyCancellation,
  transactionPeriod,
  reversalDeadline,
  isPastReversalDeadline,
} from "../services/tdsReversalService";
import type { Request } from "express";

const router = Router();

type Bag = typeof bagsTable.$inferSelect;

/** Resolves the transaction (invoice) date a bag's tax was accrued on. */
function bagTxnDate(bag: Bag): Date {
  return bag.invoiceDate ? new Date(bag.invoiceDate) : new Date(bag.createdAt);
}

/**
 * Applies the TDS/TCS reversal for a cancelled/returned bag, enforcing the
 * timing rules in tdsReversalService: if still reversible (same month or 1st–7th
 * of the next month) negative reversal entries are written; otherwise the amount
 * has been deposited and is logged as an adjustment, never reversed. Eligibility
 * is computed server-side and is not user-overridable.
 */
async function applyTaxReversal(req: Request, bag: Bag, reason: string) {
  const txnDate = bagTxnDate(bag);
  const reversalEligible = canReverseTDS(txnDate, new Date());
  const tcsAmt = parseFloat(bag.tcsAmount);
  const tdsAmt = parseFloat(bag.tdsAmount);
  const { month, year } = transactionPeriod(txnDate);

  if (reversalEligible) {
    if (tcsAmt > 0) {
      await db.insert(tcsRecordsTable).values({
        month, year,
        stateGstin: bag.stateGstin,
        stateCode: bag.stateCode,
        stateName: bag.stateCode,
        brandName: bag.brandName,
        taxableSupply: String(-parseFloat(bag.esp)),
        tcsRate: "1.00",
        tcsAmount: String(-tcsAmt),
        status: "Accrued",
        paymentDueDate: reversalDeadline(txnDate),
        isReversal: true,
        reversalReason: reason,
        originalBagId: bag.bagId,
      });
    }
    if (tdsAmt > 0) {
      await db.insert(tdsRecordsTable).values({
        month, year,
        companyName: bag.brandName,
        tan: "DELN00000A",
        grossPayment: String(-parseFloat(bag.esp)),
        tdsRate: "1.00",
        tdsAmount: String(-tdsAmt),
        netPaid: String(tdsAmt),
        status: "Pending",
        isReversal: true,
        reversalReason: reason,
        originalBagId: bag.bagId,
      });
    }
  } else {
    // Already deposited with authorities — log an adjustment, do NOT reverse.
    await db.insert(activityTable).values({
      user: req.user?.name ?? "System",
      action: `TDS/TCS already deposited for ${bag.bagId} (deadline ${reversalDeadline(txnDate)} passed) — carried as adjustment, not reversed (${reason})`,
      entityType: "compliance",
      entityRef: bag.bagId,
      level: "warning",
    });
  }

  return {
    reversalEligible,
    tcsReversed: reversalEligible ? tcsAmt : 0,
    tdsReversed: reversalEligible ? tdsAmt : 0,
    adjustmentLogged: !reversalEligible,
    deadline: reversalDeadline(txnDate),
  };
}

/**
 * POST /transactions/capture — record a payment capture (simulated PG webhook).
 * Marks the bag as captured and generates the tax invoice.
 */
router.post("/transactions/capture", authorize(["backend", "admin", "maker"]), async (req, res) => {
  try {
    const { order_id } = req.body as { order_id?: string };
    if (!order_id) return res.status(400).json({ error: "order_id is required" });

    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.orderId, order_id)).limit(1);
    if (!bag) return res.status(404).json({ error: `No order found for ${order_id}` });

    const invoice = await generateInvoice(order_id);
    await writeAudit(req, {
      entityType: "transaction",
      entityId: order_id,
      action: "PAYMENT_CAPTURED",
      changedFields: { invoiceNumber: invoice.invoiceNumber, netPayable: invoice.netPayable },
    });

    return res.json({ order_id, invoice });
  } catch (err) {
    req.log.error({ err }, "transaction capture failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : "capture failed" });
  }
});

/** GET /transactions/:orderId — order + invoice(s) detail. */
router.get("/transactions/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.orderId, orderId)).limit(1);
    if (!bag) return res.status(404).json({ error: `No order found for ${orderId}` });

    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.orderId, orderId))
      .orderBy(invoicesTable.generatedAt);

    return res.json({ order: bag, invoices });
  } catch (err) {
    req.log.error({ err }, "fetch transaction failed");
    return res.status(500).json({ error: "failed to fetch transaction" });
  }
});

/**
 * GET /transactions/:orderId/reversal-preview — server-computed reversal scenario
 * for an order, with the deadline and eligibility. Read-only; the UI uses this to
 * drive the reversal confirmation screen (the scenario is NOT user-overridable).
 */
router.get("/transactions/:orderId/reversal-preview", async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.orderId, orderId)).limit(1);
    if (!bag) return res.status(404).json({ error: `No order found for ${orderId}` });

    const cancellationCase = classifyCancellation(bag.deliveryDate, bag.windowExpiryDate);
    const txnDate = bagTxnDate(bag);
    const deadline = reversalDeadline(txnDate);
    const pastDeadline = isPastReversalDeadline(txnDate);
    const reversalEligible = canReverseTDS(txnDate, new Date());

    const scenario =
      cancellationCase === "PRE_DELIVERY" ? 1 : cancellationCase === "WITHIN_RETURN_WINDOW" ? 2 : 3;
    const title =
      scenario === 1 ? "Pre-delivery cancellation"
      : scenario === 2 ? "After-delivery return (within window)"
      : "Cancellation rejected — window expired";
    const description =
      scenario === 1 ? "The order has not been delivered. Confirming voids the invoice, issues a credit note and reverses TDS/TCS if still within the deadline."
      : scenario === 2 ? "The order is delivered and within its return window. Confirming initiates a return journey that requires brand acceptance before any credit note or reversal."
      : "The return window has expired. No credit note or tax reversal can be issued; the request is logged and rejected.";

    return res.json({
      order_id: orderId,
      case: cancellationCase,
      scenario,
      title,
      description,
      reversalStatus: bag.reversalStatus,
      reversalReason: bag.reversalReason,
      deadline,
      pastDeadline,
      reversalEligible,
      tcsAmount: parseFloat(bag.tcsAmount),
      tdsAmount: parseFloat(bag.tdsAmount),
    });
  } catch (err) {
    req.log.error({ err }, "reversal preview failed");
    return res.status(500).json({ error: "failed to compute reversal preview" });
  }
});

/** POST /transactions/:orderId/cancel — drives the four reversal scenarios server-side. */
router.post("/transactions/:orderId/cancel", authorize(["maker", "backend", "admin"]), async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const { reason } = req.body as { reason?: string };
    const cancelReason = reason ?? "Order cancelled";
    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.orderId, orderId)).limit(1);
    if (!bag) return res.status(404).json({ error: `No order found for ${orderId}` });

    // Terminal-state guard: a bag that has already been through a reversal flow must
    // not be cancelled again — re-running would insert duplicate financial reversals.
    if (bag.reversalStatus) {
      return res.status(409).json({
        error: `This order already has a reversal status (${bag.reversalStatus}) and cannot be cancelled again.`,
        reversalStatus: bag.reversalStatus,
      });
    }

    const cancellationCase = classifyCancellation(bag.deliveryDate, bag.windowExpiryDate);

    // Scenario 3: past the return window — no credit note, no reversal (BRD §5.4).
    // The request is logged and the order is marked rejected.
    if (cancellationCase === "PAST_RETURN_WINDOW") {
      await db.update(bagsTable)
        .set({ reversalStatus: "WINDOW_EXPIRED_REJECTED", reversalReason: cancelReason })
        .where(eq(bagsTable.orderId, orderId));
      await writeAudit(req, {
        entityType: "transaction",
        entityId: orderId,
        action: "CANCEL_REJECTED_PAST_WINDOW",
        changedFields: { reason: cancelReason, windowExpiryDate: bag.windowExpiryDate },
      });
      return res.json({
        order_id: orderId,
        case: cancellationCase,
        scenario: 3,
        rejected: true,
        reversalStatus: "WINDOW_EXPIRED_REJECTED",
        message: "Return window has expired — no credit note or tax reversal can be issued for this order.",
      });
    }

    // Scenario 2: delivered & within window — initiate a return journey, await brand
    // acceptance. No credit note or reversal is issued until the brand accepts.
    if (cancellationCase === "WITHIN_RETURN_WINDOW") {
      await db.update(bagsTable)
        .set({ reversalStatus: "RETURN_INITIATED", reversalReason: cancelReason, omsState: "return_initiated", eligibility: "on_hold" })
        .where(eq(bagsTable.orderId, orderId));
      await writeAudit(req, {
        entityType: "transaction",
        entityId: orderId,
        action: "RETURN_INITIATED",
        changedFields: { reason: cancelReason, case: cancellationCase },
      });
      const txnDate = bagTxnDate(bag);
      return res.json({
        order_id: orderId,
        case: cancellationCase,
        scenario: 2,
        returnJourney: true,
        reversalStatus: "RETURN_INITIATED",
        deadline: reversalDeadline(txnDate),
        pastDeadline: isPastReversalDeadline(txnDate),
        message: "Return journey initiated — awaiting brand acceptance before any credit note or tax reversal.",
      });
    }

    // Scenario 1: pre-delivery cancellation — void via credit note + reversal-if-eligible.
    let creditNote;
    try {
      creditNote = await generateCreditNote(orderId, cancelReason);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("No invoice to reverse")) {
        return res.status(422).json({ error: "Cannot cancel: no tax invoice has been captured for this order yet, so no credit note can be issued." });
      }
      throw err;
    }
    const reversal = await applyTaxReversal(req, bag, cancelReason);

    await db.update(bagsTable)
      .set({ omsState: "cancelled", eligibility: "on_hold", reversalStatus: "CANCELLED", reversalReason: cancelReason })
      .where(eq(bagsTable.orderId, orderId));
    await writeAudit(req, {
      entityType: "transaction",
      entityId: orderId,
      action: "ORDER_CANCELLED",
      changedFields: {
        creditNote: creditNote.invoiceNumber,
        reason: cancelReason,
        case: cancellationCase,
        reversalEligible: reversal.reversalEligible,
        tcsReversed: reversal.tcsReversed,
        tdsReversed: reversal.tdsReversed,
      },
    });

    return res.json({
      order_id: orderId,
      case: cancellationCase,
      scenario: 1,
      reversalStatus: "CANCELLED",
      creditNote,
      ...reversal,
    });
  } catch (err) {
    req.log.error({ err }, "cancellation failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : "cancellation failed" });
  }
});

/**
 * POST /transactions/:orderId/return/accept — brand accepts the return (Scenario 2).
 * Generates the credit note and applies the TDS/TCS reversal per the deadline rules.
 */
router.post("/transactions/:orderId/return/accept", authorize(["backend", "admin", "maker"]), async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.orderId, orderId)).limit(1);
    if (!bag) return res.status(404).json({ error: `No order found for ${orderId}` });
    if (bag.reversalStatus !== "RETURN_INITIATED") {
      return res.status(409).json({ error: "No return journey is awaiting acceptance for this order." });
    }

    const reason = bag.reversalReason ?? "Return accepted by brand";
    let creditNote;
    try {
      creditNote = await generateCreditNote(orderId, reason);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("No invoice to reverse")) {
        return res.status(422).json({ error: "Cannot accept return: no tax invoice has been captured for this order yet, so no credit note can be issued." });
      }
      throw err;
    }
    const reversal = await applyTaxReversal(req, bag, reason);

    await db.update(bagsTable)
      .set({ reversalStatus: "RETURNED", omsState: "return_accepted", eligibility: "on_hold" })
      .where(eq(bagsTable.orderId, orderId));
    await writeAudit(req, {
      entityType: "transaction",
      entityId: orderId,
      action: "RETURN_ACCEPTED",
      changedFields: {
        creditNote: creditNote.invoiceNumber,
        reason,
        reversalEligible: reversal.reversalEligible,
        tcsReversed: reversal.tcsReversed,
        tdsReversed: reversal.tdsReversed,
      },
    });

    return res.json({
      order_id: orderId,
      scenario: 2,
      reversalStatus: "RETURNED",
      creditNote,
      ...reversal,
    });
  } catch (err) {
    req.log.error({ err }, "return accept failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : "return accept failed" });
  }
});

/**
 * POST /transactions/:orderId/return/reject — brand rejects the return (Scenario 2).
 * No credit note, no reversal; the order reverts to Delivered.
 */
router.post("/transactions/:orderId/return/reject", authorize(["backend", "admin", "maker"]), async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const { reason } = req.body as { reason?: string };
    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.orderId, orderId)).limit(1);
    if (!bag) return res.status(404).json({ error: `No order found for ${orderId}` });
    if (bag.reversalStatus !== "RETURN_INITIATED") {
      return res.status(409).json({ error: "No return journey is awaiting acceptance for this order." });
    }

    // Restore eligibility: still in-window if the window is open, else eligible.
    const today = new Date().toISOString().split("T")[0];
    const restored = bag.windowExpiryDate && bag.windowExpiryDate >= today ? "in_window" : "eligible";

    await db.update(bagsTable)
      .set({ reversalStatus: "RETURN_REJECTED", reversalReason: reason ?? bag.reversalReason, omsState: "delivery_done", eligibility: restored })
      .where(eq(bagsTable.orderId, orderId));
    await writeAudit(req, {
      entityType: "transaction",
      entityId: orderId,
      action: "RETURN_REJECTED",
      changedFields: { reason: reason ?? bag.reversalReason, restoredEligibility: restored },
    });

    return res.json({
      order_id: orderId,
      scenario: 2,
      reversalStatus: "RETURN_REJECTED",
      message: "Return rejected by brand — order remains Delivered, no credit note or reversal issued.",
    });
  } catch (err) {
    req.log.error({ err }, "return reject failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : "return reject failed" });
  }
});

/** GET /invoices/:invoiceId — invoice detail. */
router.get("/invoices/:invoiceId", async (req, res) => {
  try {
    const id = parseInt(req.params.invoiceId, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "invalid invoice id" });
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    if (!invoice) return res.status(404).json({ error: "invoice not found" });
    return res.json(invoice);
  } catch (err) {
    req.log.error({ err }, "fetch invoice failed");
    return res.status(500).json({ error: "failed to fetch invoice" });
  }
});

/** GET /invoices/:invoiceId/download — download invoice as HTML. */
router.get("/invoices/:invoiceId/download", async (req, res) => {
  try {
    const id = parseInt(req.params.invoiceId, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "invalid invoice id" });
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    if (!invoice) return res.status(404).json({ error: "invoice not found" });

    const html = renderInvoiceHtml(invoice);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.html"`);
    return res.send(html);
  } catch (err) {
    req.log.error({ err }, "download invoice failed");
    return res.status(500).json({ error: "failed to download invoice" });
  }
});

export default router;
