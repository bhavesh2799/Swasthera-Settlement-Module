import { Router } from "express";
import { db, invoicesTable } from "@workspace/db";
import { and, desc, eq, gte, lte, inArray, type SQL } from "drizzle-orm";
import JSZip from "jszip";
import { renderInvoicePdf, renderBrandInvoicePdf } from "../services/invoiceService";
import type { Invoice } from "@workspace/db";

const router = Router();

/**
 * Parses the shared invoice-repository filter query into Drizzle conditions.
 * Supported: brandIds (csv), dateFrom, dateTo (YYYY-MM-DD), cycle, orderStatus,
 * stateCode (customer place-of-supply), type (INVOICE|CREDIT_NOTE).
 */
function buildInvoiceFilters(query: Record<string, unknown>): SQL[] {
  const conditions: SQL[] = [];

  const brandIdsRaw = typeof query.brandIds === "string" ? query.brandIds : "";
  const brandIds = brandIdsRaw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  if (brandIds.length) conditions.push(inArray(invoicesTable.brandId, brandIds));

  if (typeof query.dateFrom === "string" && query.dateFrom)
    conditions.push(gte(invoicesTable.invoiceDate, query.dateFrom));
  if (typeof query.dateTo === "string" && query.dateTo)
    conditions.push(lte(invoicesTable.invoiceDate, query.dateTo));

  if (typeof query.cycle === "string" && query.cycle)
    conditions.push(eq(invoicesTable.settlementCycle, query.cycle));

  if (typeof query.orderStatus === "string" && query.orderStatus)
    conditions.push(eq(invoicesTable.orderStatus, query.orderStatus));

  if (typeof query.stateCode === "string" && query.stateCode)
    conditions.push(eq(invoicesTable.customerStateCode, query.stateCode));

  if (query.type === "INVOICE" || query.type === "CREDIT_NOTE")
    conditions.push(eq(invoicesTable.invoiceType, query.type));

  return conditions;
}

async function queryInvoices(query: Record<string, unknown>): Promise<Invoice[]> {
  const conditions = buildInvoiceFilters(query);
  const base = db.select().from(invoicesTable).orderBy(desc(invoicesTable.generatedAt));
  if (conditions.length) return base.where(and(...conditions));
  return base;
}

/** GET /invoices — customer-invoice repository list with filters. */
router.get("/invoices", async (req, res) => {
  try {
    const rows = await queryInvoices(req.query as Record<string, unknown>);
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "list invoices failed");
    return res.status(500).json({ error: "failed to list invoices" });
  }
});

/** GET /invoices/export.csv — filtered invoice metadata as CSV. */
router.get("/invoices/export.csv", async (req, res) => {
  try {
    const rows = await queryInvoices(req.query as Record<string, unknown>);
    const headers = [
      "Invoice Number", "Type", "Invoice Date", "Order ID", "Bag ID", "Brand",
      "Customer", "Place of Supply", "State Code", "Warehouse", "Warehouse GSTIN",
      "Seller GSTIN", "Product", "HSN", "Qty", "Unit Price", "Taxable Value",
      "GST Type", "CGST", "SGST", "IGST", "TCS", "Total Invoice Value",
      "Payment Method", "Order Status", "Settlement Period",
    ];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        r.invoiceNumber, r.invoiceType, r.invoiceDate, r.orderId, r.bagId, r.brandName,
        r.customerName, r.customerState, r.customerStateCode, r.warehouseName, r.warehouseGstin,
        r.sellerGstin, r.productName, r.hsnCode, r.quantity, r.unitPrice, r.taxableValue,
        r.gstType, r.cgstAmount, r.sgstAmount, r.igstAmount, r.tcsCollected, r.totalInvoiceValue,
        r.paymentMethod, r.orderStatus, r.settlementCycle,
      ].map(esc).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-repository-${Date.now()}.csv"`);
    return res.send(lines.join("\n"));
  } catch (err) {
    req.log.error({ err }, "invoice csv export failed");
    return res.status(500).json({ error: "failed to export csv" });
  }
});

/** GET /invoices/export.zip — filtered set of invoice PDFs bundled into a ZIP. */
router.get("/invoices/export.zip", async (req, res) => {
  try {
    const rows = await queryInvoices(req.query as Record<string, unknown>);
    if (!rows.length) return res.status(404).json({ error: "no invoices match the filters" });

    const docType = typeof req.query.docType === "string" && req.query.docType === "brand" ? "brand" : "customer";
    const zip = new JSZip();
    for (const inv of rows) {
      const pdf = docType === "brand" ? await renderBrandInvoicePdf(inv) : await renderInvoicePdf(inv);
      const suffix = docType === "brand" ? "-commission" : "";
      zip.file(`${inv.invoiceNumber}${suffix}.pdf`, pdf);
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="invoices-${Date.now()}.zip"`);
    return res.send(buffer);
  } catch (err) {
    req.log.error({ err }, "invoice zip export failed");
    return res.status(500).json({ error: "failed to export zip" });
  }
});

/** GET /invoices/bulk.zip — selected invoices by ID as ZIP (docType=customer|brand). */
router.get("/invoices/bulk.zip", async (req, res) => {
  try {
    const idsRaw = typeof req.query.ids === "string" ? req.query.ids : "";
    const ids = idsRaw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    if (!ids.length) return res.status(400).json({ error: "ids query param required (comma-separated invoice IDs)" });

    const docType = typeof req.query.docType === "string" && req.query.docType === "brand" ? "brand" : "customer";
    const rows = await db.select().from(invoicesTable).where(inArray(invoicesTable.id, ids));
    if (!rows.length) return res.status(404).json({ error: "No invoices found for given IDs" });

    const zip = new JSZip();
    for (const inv of rows) {
      const pdf = docType === "brand" ? await renderBrandInvoicePdf(inv) : await renderInvoicePdf(inv);
      const suffix = docType === "brand" ? "-commission" : "";
      zip.file(`${inv.invoiceNumber}${suffix}.pdf`, pdf);
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="invoices-selected-${Date.now()}.zip"`);
    return res.send(buffer);
  } catch (err) {
    req.log.error({ err }, "bulk zip failed");
    return res.status(500).json({ error: "failed to export zip" });
  }
});

/** GET /invoices/bulk.csv — selected invoices by ID as CSV (includes brand financials). */
router.get("/invoices/bulk.csv", async (req, res) => {
  try {
    const idsRaw = typeof req.query.ids === "string" ? req.query.ids : "";
    const ids = idsRaw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    if (!ids.length) return res.status(400).json({ error: "ids query param required (comma-separated invoice IDs)" });

    const rows = await db.select().from(invoicesTable).where(inArray(invoicesTable.id, ids));
    const headers = [
      "Invoice Number", "Type", "Invoice Date", "Order ID", "Bag ID", "Brand",
      "Customer", "Place of Supply", "State Code", "Warehouse", "Warehouse GSTIN",
      "Seller GSTIN", "Product", "HSN", "Qty", "Unit Price", "Taxable Value",
      "GST Type", "CGST", "SGST", "IGST", "TCS Collected", "Total Invoice Value",
      "Payment Method", "Order Status", "Settlement Period",
      "Commission Amount", "GST on Commission", "TDS Deducted", "Net Payable to Brand",
    ];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        r.invoiceNumber, r.invoiceType, r.invoiceDate, r.orderId, r.bagId, r.brandName,
        r.customerName, r.customerState, r.customerStateCode, r.warehouseName, r.warehouseGstin,
        r.sellerGstin, r.productName, r.hsnCode, r.quantity, r.unitPrice, r.taxableValue,
        r.gstType, r.cgstAmount, r.sgstAmount, r.igstAmount, r.tcsCollected, r.totalInvoiceValue,
        r.paymentMethod, r.orderStatus, r.settlementCycle,
        r.commissionAmount, r.gstOnCommission, r.tdsDeducted, r.netPayable,
      ].map(esc).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="invoices-selected-${Date.now()}.csv"`);
    return res.send(lines.join("\n"));
  } catch (err) {
    req.log.error({ err }, "bulk csv failed");
    return res.status(500).json({ error: "failed to export csv" });
  }
});

/** GET /invoices/:invoiceId/pdf — single customer invoice / credit note as PDF. */
router.get("/invoices/:invoiceId/pdf", async (req, res) => {
  try {
    const id = parseInt(req.params.invoiceId, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "invalid invoice id" });
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    if (!invoice) return res.status(404).json({ error: "invoice not found" });

    const pdf = await renderInvoicePdf(invoice);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    return res.send(Buffer.from(pdf));
  } catch (err) {
    req.log.error({ err }, "invoice pdf failed");
    return res.status(500).json({ error: "failed to render pdf" });
  }
});

/** GET /invoices/:invoiceId/brand-pdf — brand settlement invoice (deduction waterfall) as PDF. */
router.get("/invoices/:invoiceId/brand-pdf", async (req, res) => {
  try {
    const id = parseInt(req.params.invoiceId, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "invalid invoice id" });
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    if (!invoice) return res.status(404).json({ error: "invoice not found" });

    const pdf = await renderBrandInvoicePdf(invoice);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}-brand.pdf"`);
    return res.send(Buffer.from(pdf));
  } catch (err) {
    req.log.error({ err }, "brand invoice pdf failed");
    return res.status(500).json({ error: "failed to render brand pdf" });
  }
});

export default router;
