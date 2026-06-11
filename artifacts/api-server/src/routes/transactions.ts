import { Router } from "express";
import { db, bagsTable, invoicesTable, tcsRecordsTable, tdsRecordsTable, activityTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authorize } from "../middlewares/rbac";
import { writeAudit } from "../services/audit";
import { generateInvoice, generateCreditNote, renderInvoiceHtml } from "../services/invoiceService";
import { canReverseTDS, classifyCancellation, transactionPeriod } from "../services/tdsReversalService";

const router = Router();

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

/** POST /transactions/:orderId/cancel — cancellation flow (credit note + reversal). */
router.post("/transactions/:orderId/cancel", authorize(["maker", "backend", "admin"]), async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const { reason } = req.body as { reason?: string };
    const cancelReason = reason ?? "Order cancelled";
    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.orderId, orderId)).limit(1);
    if (!bag) return res.status(404).json({ error: `No order found for ${orderId}` });

    const cancellationCase = classifyCancellation(bag.deliveryDate, bag.windowExpiryDate);

    // Case 3: past the return window — no credit note, no reversal (BRD §5.4).
    if (cancellationCase === "PAST_RETURN_WINDOW") {
      await writeAudit(req, {
        entityType: "transaction",
        entityId: orderId,
        action: "CANCEL_REJECTED_PAST_WINDOW",
        changedFields: { reason: cancelReason, windowExpiryDate: bag.windowExpiryDate },
      });
      return res.status(409).json({
        error: "Return window has expired — no credit note or tax reversal can be issued for this order.",
        case: cancellationCase,
      });
    }

    // Cases 1 & 2: void via credit note.
    const creditNote = await generateCreditNote(orderId, cancelReason);

    // Determine TDS/TCS reversal eligibility from the transaction (invoice) date.
    const txnDate = bag.invoiceDate ? new Date(bag.invoiceDate) : new Date(bag.createdAt);
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
          paymentDueDate: `${year}-${String(txnDate.getMonth() + 2).padStart(2, "0")}-07`,
          isReversal: true,
          reversalReason: cancelReason,
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
          reversalReason: cancelReason,
          originalBagId: bag.bagId,
        });
      }
    } else {
      // Already deposited with authorities — log an adjustment, do NOT reverse.
      await db.insert(activityTable).values({
        user: req.user?.name ?? "System",
        action: `TDS/TCS already deposited for ${bag.bagId} — carried as adjustment, not reversed (${cancelReason})`,
        entityType: "compliance",
        entityRef: bag.bagId,
        level: "warning",
      });
    }

    await db.update(bagsTable).set({ omsState: "cancelled", eligibility: "on_hold" }).where(eq(bagsTable.orderId, orderId));
    await writeAudit(req, {
      entityType: "transaction",
      entityId: orderId,
      action: "ORDER_CANCELLED",
      changedFields: {
        creditNote: creditNote.invoiceNumber,
        reason: cancelReason,
        case: cancellationCase,
        reversalEligible,
        tcsReversed: reversalEligible ? tcsAmt : 0,
        tdsReversed: reversalEligible ? tdsAmt : 0,
      },
    });

    return res.json({
      order_id: orderId,
      case: cancellationCase,
      creditNote,
      reversalEligible,
      tcsReversed: reversalEligible ? tcsAmt : 0,
      tdsReversed: reversalEligible ? tdsAmt : 0,
      adjustmentLogged: !reversalEligible,
    });
  } catch (err) {
    req.log.error({ err }, "cancellation failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : "cancellation failed" });
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
