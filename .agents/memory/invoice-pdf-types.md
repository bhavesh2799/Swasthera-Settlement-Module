---
name: Invoice PDF document types
description: The two distinct PDF documents derivable from a single Swasthera invoices row
---

# Two PDFs per invoice row

A captured order produces ONE `invoices` row, but the marketplace owes TWO conceptually different documents from it. Both are built via the shared `pdfService` (`InvoiceDocument` shape) in `invoiceService.ts`:

- **Customer tax invoice** — `buildCustomerInvoiceDocument` → `GET /api/invoices/:id/pdf`. GST tax invoice to the END CUSTOMER: CGST/SGST/IGST, Bill To customer, HSN/qty/taxable. Credit notes reuse the same builder (signed/negative values).
- **Brand settlement invoice** — `buildBrandInvoiceDocument` → `GET /api/invoices/:id/brand-pdf`. The deduction waterfall the marketplace raises AGAINST THE BRAND: GMV → less commission → less GST on commission @18% → less TDS (194-O) → less TCS (Sec 52) → net payable to brand.

**Why:** users distinguish "customer invoice" (what the buyer gets) from "brand invoice" (the brand's settlement statement). They are different audiences and different totals from the same underlying row, so both download buttons must exist wherever an invoice is listed.

**How to apply:** any new place that lists/downloads invoices should offer BOTH PDFs. There is also a legacy `GET /api/invoices/:id/download` (HTML preview) — keep it but do NOT link new UI to it; the UI standardised on the PDF routes.

# Sign/color convention (don't get this wrong)
Credit-note invoice rows store ALREADY-SIGNED (negative) amounts; `formatINR` renders the leading `-` itself. The `summary.negative`/`row.negative` flag does NOT change the number — it only colors it RED. So set `negative: isCn` on EVERY monetary line (not `!isCn` on deductions): normal invoices render all-black, credit notes render all-red. A "Less:" label is enough to convey a deduction on a normal invoice; do not red-color deductions there.

**Why:** an earlier brand-invoice build used `negative: !isCn` for deduction lines, which colored deductions red on normal invoices and left them black on credit notes — the opposite of the customer-invoice convention and visually misleading.
