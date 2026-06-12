import { db, invoicesTable, bagsTable, brandsTable, warehousesTable, onboardingsTable } from "@workspace/db";
import { eq, and, desc, like } from "drizzle-orm";
import type { Invoice, Bag } from "@workspace/db";
import { generateInvoicePdf, formatINR, type InvoiceDocument } from "./pdfService";

const GST_ON_COMMISSION_RATE = 0.18;

export const PLATFORM_NAME = "Swasthera Marketplace Pvt. Ltd.";
export const PLATFORM_GSTIN = "27AABCS1234A1Z5";

/** GST state code → state name (used to render warehouse/customer place of supply). */
const STATE_NAMES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "19": "West Bengal", "21": "Odisha", "23": "Madhya Pradesh", "24": "Gujarat",
  "27": "Maharashtra", "29": "Karnataka", "32": "Kerala", "33": "Tamil Nadu", "36": "Telangana",
  "37": "Andhra Pradesh",
};

/** Map a free OMS state string to a normalized order status for filtering/snapshot. */
function normalizeOrderStatus(omsState: string): string {
  const s = (omsState || "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("rto") || s.includes("return")) return "returned";
  if (s.includes("delivered") || s.includes("delivery_done")) return "delivered";
  return "in_transit";
}

/** HSN code for a brand category (apparel-leaning marketplace defaults). */
function hsnForCategory(category: string | null | undefined): string {
  const c = (category || "").toLowerCase();
  if (c.includes("footwear") || c.includes("shoe")) return "6403";
  if (c.includes("accessor") || c.includes("bag")) return "4202";
  if (c.includes("beauty") || c.includes("cosmet")) return "3304";
  if (c.includes("home") || c.includes("decor")) return "6304";
  if (c.includes("electronic")) return "8517";
  // Apparel / fashion / textile default.
  return "6109";
}

/** Humanize a SKU into a readable product name. */
function productNameFromSku(sku: string, brandName: string): string {
  const parts = (sku || "").split("-");
  // Drop a leading brand token and a trailing numeric token, title-case the rest.
  const middle = parts.slice(1, parts.length > 2 ? -1 : undefined).filter(Boolean);
  const words = (middle.length ? middle : parts).map(
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
  const label = words.join(" ").trim();
  return label ? `${brandName} ${label}` : `${brandName} Product`;
}

/** Output-GST slab on apparel/goods: 5% up to INR 1000/unit, else 12%. */
function gstRateForUnitPrice(unitPrice: number): number {
  return unitPrice <= 1000 ? 5 : 12;
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

function money(n: number): string {
  return n.toFixed(2);
}

/** Format a settlement cycle string to a human-readable period label.
 *  "MAY-2026-C1" → "May 2026" */
function formatCyclePeriod(cycle: string): string {
  const MAP: Record<string, string> = {
    JAN: "January", FEB: "February", MAR: "March", APR: "April",
    MAY: "May", JUN: "June", JUL: "July", AUG: "August",
    SEP: "September", OCT: "October", NOV: "November", DEC: "December",
  };
  const parts = cycle.split("-");
  if (parts.length >= 2 && MAP[parts[0]]) return `${MAP[parts[0]]} ${parts[1]}`;
  return cycle;
}

/**
 * Generates the next invoice number for a brand in the series
 * BRANDCODE-INV-YYYY-NNNN (or BRANDCODE-CN-YYYY-NNNN for credit notes).
 * Queries the last invoice for the brand/year and increments the 4-digit suffix.
 */
async function nextInvoiceNumber(
  brandCode: string,
  type: "INVOICE" | "CREDIT_NOTE",
): Promise<string> {
  const year = new Date().getFullYear();
  const segment = type === "CREDIT_NOTE" ? "CN" : "INV";
  const prefix = `${brandCode}-${segment}-${year}-`;
  const [last] = await db
    .select({ invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .where(like(invoicesTable.invoiceNumber, `${prefix}%`))
    .orderBy(desc(invoicesTable.invoiceNumber))
    .limit(1);
  let next = 1;
  if (last?.invoiceNumber) {
    const suffix = last.invoiceNumber.slice(prefix.length);
    const parsed = parseInt(suffix, 10);
    if (!Number.isNaN(parsed)) next = parsed + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

interface BrandRow {
  id: number;
  brandCode: string | null;
  brandName: string;
  brandLegalName: string | null;
  brandCategory: string;
  onboardingId: number;
  commissionRate: string;
  tcsRate: string;
  tdsRate: string;
}

/**
 * Computes marketplace financials for a bag using the brand's commercial terms.
 * net_payable = gmv - commission - gst_on_commission - tds - tcs
 */
function computeFinancials(bag: Bag, brand: BrandRow) {
  const gmv = num(bag.esp) * num(bag.qty);
  const commissionAmount = (gmv * num(brand.commissionRate)) / 100;
  const gstOnCommission = commissionAmount * GST_ON_COMMISSION_RATE;
  const tdsDeducted = num(bag.tdsAmount) || (gmv * num(brand.tdsRate)) / 100;
  const tcsCollected = num(bag.tcsAmount) || (gmv * num(brand.tcsRate)) / 100;
  const netPayable = gmv - commissionAmount - gstOnCommission - tdsDeducted - tcsCollected;
  return { gmv, commissionAmount, gstOnCommission, tdsDeducted, tcsCollected, netPayable };
}

/**
 * Builds the customer-invoice snapshot (parties, line item, GST breakup) from
 * the OMS bag + brand + warehouse + onboarding. Intra-state (CGST+SGST) vs
 * inter-state (IGST) is derived by comparing the ship-from warehouse state code
 * against the customer's billing/place-of-supply state code.
 */
async function computeCustomerSnapshot(bag: Bag, brand: BrandRow) {
  const [onboarding] = await db
    .select({ masterGstin: onboardingsTable.masterGstin, companyName: onboardingsTable.companyName })
    .from(onboardingsTable)
    .where(eq(onboardingsTable.id, brand.onboardingId))
    .limit(1);

  const [warehouse] = await db
    .select()
    .from(warehousesTable)
    .where(eq(warehousesTable.brandId, brand.id))
    .orderBy(desc(warehousesTable.isPrimary))
    .limit(1);

  // bag.stateGstin is the authoritative ship-from warehouse GSTIN.
  const warehouseGstin = warehouse?.warehouseGstin || bag.stateGstin;
  const warehouseStateCode = warehouseGstin.slice(0, 2);
  const warehouseState =
    warehouse?.warehouseState || STATE_NAMES[warehouseStateCode] || bag.stateCode;
  const warehouseName = warehouse?.warehouseName || `${bag.brandName} Warehouse`;

  const sellerGstin = onboarding?.masterGstin || warehouseGstin;

  const customerStateCode = bag.customerStateCode || warehouseStateCode;
  const customerState = bag.customerState || STATE_NAMES[customerStateCode] || customerStateCode;

  const unitPrice = num(bag.esp);
  const quantity = num(bag.qty);
  const taxableValue = unitPrice * quantity;
  const gstRate = gstRateForUnitPrice(unitPrice);

  // GST type (IGST vs CGST/SGST) is determined by the company's registered state
  // vs the customer's place of supply — not the warehouse ship-from state.
  const companyStateCode = sellerGstin.slice(0, 2);
  const isIntra = companyStateCode === customerStateCode;
  let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0, igstRate = 0, igstAmount = 0;
  if (isIntra) {
    cgstRate = gstRate / 2;
    sgstRate = gstRate / 2;
    cgstAmount = (taxableValue * cgstRate) / 100;
    sgstAmount = (taxableValue * sgstRate) / 100;
  } else {
    igstRate = gstRate;
    igstAmount = (taxableValue * igstRate) / 100;
  }
  const totalInvoiceValue = taxableValue + cgstAmount + sgstAmount + igstAmount;

  return {
    invoiceDate: bag.invoiceDate || new Date().toISOString().slice(0, 10),
    customerName: bag.customerName || "Marketplace Customer",
    customerAddress: bag.customerAddress || "",
    customerStateCode,
    customerState,
    sellerGstin,
    warehouseName,
    warehouseGstin,
    warehouseState,
    warehouseStateCode,
    productName: productNameFromSku(bag.sku, bag.brandName),
    hsnCode: hsnForCategory(brand.brandCategory),
    quantity,
    unitPrice: money(unitPrice),
    taxableValue: money(taxableValue),
    gstType: isIntra ? "INTRA" : "INTER",
    cgstRate: money(cgstRate),
    cgstAmount: money(cgstAmount),
    sgstRate: money(sgstRate),
    sgstAmount: money(sgstAmount),
    igstRate: money(igstRate),
    igstAmount: money(igstAmount),
    totalInvoiceValue: money(totalInvoiceValue),
    paymentMethod: bag.paymentMethod || "Prepaid",
    platformName: PLATFORM_NAME,
    platformGstin: PLATFORM_GSTIN,
    orderStatus: normalizeOrderStatus(bag.omsState),
    settlementCycle: bag.cycle,
  };
}

/**
 * Generates an INVOICE for an order/bag. Idempotent — returns the existing
 * invoice if one already exists for the order.
 */
export async function generateInvoice(orderId: string): Promise<Invoice> {
  const existing = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.orderId, orderId), eq(invoicesTable.invoiceType, "INVOICE")))
    .limit(1);
  if (existing[0]) return existing[0];

  const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.orderId, orderId)).limit(1);
  if (!bag) throw new Error(`No order/bag found for orderId ${orderId}`);

  const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, bag.brandId)).limit(1);
  if (!brand) throw new Error(`No brand found for brandId ${bag.brandId}`);
  if (!brand.brandCode) throw new Error(`Brand ${brand.id} has no brandCode`);

  const f = computeFinancials(bag, brand);
  const snap = await computeCustomerSnapshot(bag, brand);
  const invoiceNumber = await nextInvoiceNumber(brand.brandCode, "INVOICE");

  const [created] = await db
    .insert(invoicesTable)
    .values({
      invoiceNumber,
      invoiceType: "INVOICE",
      orderId: bag.orderId,
      bagId: bag.bagId,
      brandId: bag.brandId,
      brandName: bag.brandName,
      gmv: money(f.gmv),
      commissionAmount: money(f.commissionAmount),
      gstOnCommission: money(f.gstOnCommission),
      tdsDeducted: money(f.tdsDeducted),
      tcsCollected: money(f.tcsCollected),
      netPayable: money(f.netPayable),
      ...snap,
    })
    .returning();
  return created;
}

/**
 * Generates a CREDIT_NOTE that reverses the original invoice for an order
 * (called on cancellation/return approval). Monetary amounts are negated; the
 * customer-invoice snapshot (parties, product, GST split) is copied verbatim.
 */
export async function generateCreditNote(orderId: string, reason: string): Promise<Invoice> {
  const [original] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.orderId, orderId), eq(invoicesTable.invoiceType, "INVOICE")))
    .limit(1);
  if (!original) throw new Error(`No invoice to reverse for orderId ${orderId}`);

  const existingCn = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.orderId, orderId), eq(invoicesTable.invoiceType, "CREDIT_NOTE")))
    .limit(1);
  if (existingCn[0]) return existingCn[0];

  const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, original.brandId)).limit(1);
  if (!brand?.brandCode) throw new Error(`Brand ${original.brandId} has no brandCode`);

  const invoiceNumber = await nextInvoiceNumber(brand.brandCode, "CREDIT_NOTE");

  const neg = (v: string | null) => money(-num(v));
  const [created] = await db
    .insert(invoicesTable)
    .values({
      invoiceNumber,
      invoiceType: "CREDIT_NOTE",
      orderId: original.orderId,
      bagId: original.bagId,
      brandId: original.brandId,
      brandName: original.brandName,
      gmv: neg(original.gmv),
      commissionAmount: neg(original.commissionAmount),
      gstOnCommission: neg(original.gstOnCommission),
      tdsDeducted: neg(original.tdsDeducted),
      tcsCollected: neg(original.tcsCollected),
      netPayable: neg(original.netPayable),
      // Customer-invoice snapshot — copy descriptive fields, negate monetary ones.
      invoiceDate: new Date().toISOString().slice(0, 10),
      customerName: original.customerName,
      customerAddress: original.customerAddress,
      customerStateCode: original.customerStateCode,
      customerState: original.customerState,
      sellerGstin: original.sellerGstin,
      warehouseName: original.warehouseName,
      warehouseGstin: original.warehouseGstin,
      warehouseState: original.warehouseState,
      warehouseStateCode: original.warehouseStateCode,
      productName: original.productName,
      hsnCode: original.hsnCode,
      quantity: original.quantity,
      unitPrice: original.unitPrice,
      taxableValue: neg(original.taxableValue),
      gstType: original.gstType,
      cgstRate: original.cgstRate,
      cgstAmount: neg(original.cgstAmount),
      sgstRate: original.sgstRate,
      sgstAmount: neg(original.sgstAmount),
      igstRate: original.igstRate,
      igstAmount: neg(original.igstAmount),
      totalInvoiceValue: neg(original.totalInvoiceValue),
      paymentMethod: original.paymentMethod,
      platformName: original.platformName,
      platformGstin: original.platformGstin,
      orderStatus: "returned",
      settlementCycle: original.settlementCycle,
      originalInvoiceId: original.id,
      reason,
    })
    .returning();
  return created;
}

/**
 * Builds a generic `InvoiceDocument` for a customer tax invoice / credit note,
 * reusing the shared PDF renderer (`pdfService`).
 */
export function buildCustomerInvoiceDocument(inv: Invoice): InvoiceDocument {
  const isCn = inv.invoiceType === "CREDIT_NOTE";
  const qty = inv.quantity ?? 1;
  const unitPrice = num(inv.unitPrice);
  const taxable = num(inv.taxableValue);
  const isIntra = inv.gstType === "INTRA";

  const summary: InvoiceDocument["summary"] = [
    { label: "Taxable Value", value: formatINR(taxable), negative: isCn },
  ];
  if (isIntra) {
    summary.push({ label: `CGST @ ${num(inv.cgstRate)}%`, value: formatINR(num(inv.cgstAmount)), negative: isCn });
    summary.push({ label: `SGST @ ${num(inv.sgstRate)}%`, value: formatINR(num(inv.sgstAmount)), negative: isCn });
  } else {
    summary.push({ label: `IGST @ ${num(inv.igstRate)}%`, value: formatINR(num(inv.igstAmount)), negative: isCn });
  }
  return {
    brandHeading: inv.brandName ?? "Brand",
    docTitle: isCn ? "Credit Note" : "Tax Invoice",
    invoiceNumber: inv.invoiceNumber,
    metaItems: [
      { label: "Invoice Date", value: inv.invoiceDate ?? "" },
      { label: "Order ID", value: inv.orderId },
      { label: "Order Status", value: (inv.orderStatus ?? "").toUpperCase() },
      { label: "Payment", value: inv.paymentMethod ?? "" },
      { label: "Settlement Period", value: inv.settlementCycle ?? "" },
    ],
    parties: [
      {
        heading: "Sold By (Seller)",
        name: inv.brandName ?? "",
        lines: [
          `GSTIN: ${inv.sellerGstin ?? "-"}`,
          `Sold via ${inv.platformName ?? PLATFORM_NAME}`,
          `Platform GSTIN: ${inv.platformGstin ?? PLATFORM_GSTIN}`,
        ],
      },
      {
        heading: "Ship From (Warehouse)",
        name: inv.warehouseName ?? "",
        lines: [
          `GSTIN: ${inv.warehouseGstin ?? "-"}`,
          `State: ${inv.warehouseState ?? "-"} (${inv.warehouseStateCode ?? "-"})`,
        ],
      },
      {
        heading: "Bill To (Customer)",
        name: inv.customerName ?? "",
        lines: [
          inv.customerAddress ?? "",
          `Place of Supply: ${inv.customerState ?? "-"} (${inv.customerStateCode ?? "-"})`,
        ].filter(Boolean),
      },
    ],
    columns: [
      { key: "product", header: "Product", width: 4 },
      { key: "hsn", header: "HSN", width: 1.4 },
      { key: "qty", header: "Qty", width: 1, align: "right" },
      { key: "rate", header: "Unit Price", width: 1.8, align: "right" },
      { key: "taxable", header: "Taxable Value", width: 2, align: "right" },
    ],
    rows: [
      {
        negative: isCn,
        cells: {
          product: inv.productName ?? "",
          hsn: inv.hsnCode ?? "",
          qty: String(qty),
          rate: formatINR(unitPrice),
          taxable: formatINR(taxable),
        },
      },
    ],
    summary,
    netLabel: isCn ? "Total Credit Value" : "Total Invoice Value",
    netValue: formatINR(num(inv.totalInvoiceValue)),
    footerNotes: [
      isIntra
        ? "Intra-state supply — CGST + SGST levied (seller and buyer are in the same state)."
        : "Inter-state supply — IGST levied (seller and buyer are in different states).",
      ...(inv.reason ? [`Reason: ${inv.reason}`] : []),
      "This is a system-generated document and does not require a physical signature.",
    ],
    signatory: {
      heading: `For ${inv.brandName ?? "Brand"}`,
      lines: ["Authorised Signatory", `via ${inv.platformName ?? PLATFORM_NAME}`],
    },
    digitalSignature: true,
  };
}

/** Renders a customer tax invoice / credit note as a PDF byte buffer. */
export async function renderInvoicePdf(inv: Invoice): Promise<Uint8Array> {
  return generateInvoicePdf(buildCustomerInvoiceDocument(inv));
}

/**
 * Builds a commission tax invoice that the marketplace raises against the brand
 * for platform commission on sales (SAC 998599). Matches the TAX INVOICE format
 * used by marketplace operators (e.g. AP/M/Jun26/004).
 *
 * GST type (IGST vs CGST+SGST) is determined by comparing the marketplace's
 * registered state (PLATFORM_GSTIN prefix "27" = Maharashtra) against the brand's
 * registered GSTIN state code. All commission invoices are at 18% GST.
 *
 * The customer tax invoice (GMV-level) is produced by `buildCustomerInvoiceDocument`.
 */
export function buildBrandInvoiceDocument(inv: Invoice): InvoiceDocument {
  const isCn = inv.invoiceType === "CREDIT_NOTE";

  const commissionAmt = num(inv.commissionAmount);
  const gstOnComm = num(inv.gstOnCommission);
  const totalAmt = commissionAmt + gstOnComm;

  // GST type: marketplace is in Maharashtra (27); compare with brand's GSTIN state.
  const marketplaceStateCode = (inv.platformGstin ?? PLATFORM_GSTIN).slice(0, 2); // "27"
  const brandStateCode = (inv.sellerGstin ?? "").slice(0, 2);
  const isIntra = !!brandStateCode && marketplaceStateCode === brandStateCode;
  const gstRate = 18;
  const marketplaceStateName = STATE_NAMES[marketplaceStateCode] ?? "Maharashtra";
  const brandStateName = STATE_NAMES[brandStateCode] ?? brandStateCode;
  const periodLabel = inv.settlementCycle ? formatCyclePeriod(inv.settlementCycle) : (inv.invoiceDate ?? "");

  const summary: InvoiceDocument["summary"] = [
    { label: "Taxable Value", value: formatINR(commissionAmt), negative: isCn },
  ];
  if (isIntra) {
    const half = gstRate / 2;
    summary.push({ label: `CGST @ ${half}%`, value: formatINR(gstOnComm / 2), negative: isCn });
    summary.push({ label: `SGST @ ${half}%`, value: formatINR(gstOnComm / 2), negative: isCn });
  } else {
    summary.push({ label: `IGST @ ${gstRate}%`, value: formatINR(gstOnComm), negative: isCn });
  }

  return {
    brandHeading: inv.platformName ?? PLATFORM_NAME,
    docTitle: isCn ? "Commission Credit Note" : "Commission Tax Invoice",
    invoiceNumber: inv.invoiceNumber,
    metaItems: [
      { label: "Invoice Date", value: inv.invoiceDate ?? "" },
      { label: "Order ID", value: inv.orderId },
      { label: "Settlement Period", value: inv.settlementCycle ?? "" },
      { label: "SAC Code", value: "998599" },
      { label: "Reverse Charge", value: "No" },
    ],
    parties: [
      {
        heading: "Billed From (Marketplace Operator)",
        name: inv.platformName ?? PLATFORM_NAME,
        lines: [
          `GSTIN: ${inv.platformGstin ?? PLATFORM_GSTIN}`,
          `State: ${marketplaceStateName} (${marketplaceStateCode})`,
        ],
      },
      {
        heading: "Billed To (Brand / Seller)",
        name: inv.brandName ?? "",
        lines: [
          `GSTIN: ${inv.sellerGstin ?? "-"}`,
          `State: ${brandStateName} (${brandStateCode || "-"})`,
          `POS: ${brandStateName} (${brandStateCode || "-"})`,
          ...(inv.warehouseName ? [`Warehouse: ${inv.warehouseName}`] : []),
        ].filter(Boolean),
      },
    ],
    columns: [
      { key: "no", header: "#", width: 0.6, align: "right" },
      { key: "desc", header: "Description of Service", width: 5.2 },
      { key: "sac", header: "SAC", width: 1.2 },
      { key: "taxable", header: "Taxable Value", width: 2.0, align: "right" },
    ],
    rows: [
      {
        negative: isCn,
        cells: {
          no: "01",
          desc: `Platform Commission on Sales\nPeriod: ${periodLabel}`,
          sac: "998599",
          taxable: formatINR(commissionAmt),
        },
      },
    ],
    summary,
    netLabel: isCn ? "Total Credit Amount" : "Total Invoice Amount",
    netValue: formatINR(totalAmt),
    footerNotes: [
      "SAC 998599 — Platform / Marketplace Services.",
      isIntra
        ? "Intra-state supply — CGST + SGST levied."
        : "Inter-state supply — IGST levied (marketplace and brand are in different states).",
      `Order ${inv.orderId}: GMV ${formatINR(num(inv.gmv))} · TDS ₹${num(inv.tdsDeducted).toFixed(2)} deducted (§194-O) · TCS ₹${num(inv.tcsCollected).toFixed(2)} collected (§52 GST) · Net payable to brand: ${formatINR(num(inv.netPayable))}.`,
      ...(inv.reason ? [`Reason: ${inv.reason}`] : []),
      "This is a system-generated tax invoice and does not require a physical signature.",
    ],
    signatory: {
      heading: `For ${inv.platformName ?? PLATFORM_NAME}`,
      lines: ["Authorised Signatory"],
    },
    digitalSignature: true,
  };
}

/** Renders a brand settlement invoice / credit note as a PDF byte buffer. */
export async function renderBrandInvoicePdf(inv: Invoice): Promise<Uint8Array> {
  return generateInvoicePdf(buildBrandInvoiceDocument(inv));
}

/** Renders an invoice as a simple HTML document for download/preview. */
export function renderInvoiceHtml(inv: Invoice): string {
  const isCn = inv.invoiceType === "CREDIT_NOTE";
  const title = isCn ? "Credit Note" : "Tax Invoice";
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#475569">${label}</td><td style="padding:6px 12px;text-align:right;font-variant-numeric:tabular-nums">${value}</td></tr>`;
  const inr = (v: string | null) => `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${inv.invoiceNumber}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 4px">${inv.brandName ?? "Swasthera"} — ${title}</h1>
  <p style="color:#64748b;margin:0 0 24px">${inv.invoiceNumber}</p>
  <p><strong>Customer:</strong> ${inv.customerName ?? "-"}<br/>
     <strong>Order:</strong> ${inv.orderId}<br/>
     <strong>Generated:</strong> ${new Date(inv.generatedAt).toLocaleString("en-IN")}</p>
  ${inv.reason ? `<p style="color:#b45309"><strong>Reason:</strong> ${inv.reason}</p>` : ""}
  <table style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #e2e8f0">
    ${row("Taxable Value", inr(inv.taxableValue))}
    ${inv.gstType === "INTRA"
      ? row(`CGST @ ${num(inv.cgstRate)}%`, inr(inv.cgstAmount)) + row(`SGST @ ${num(inv.sgstRate)}%`, inr(inv.sgstAmount))
      : row(`IGST @ ${num(inv.igstRate)}%`, inr(inv.igstAmount))}
    <tr style="border-top:2px solid #0f172a;font-weight:700">
      <td style="padding:10px 12px">Total Invoice Value</td>
      <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${inr(inv.totalInvoiceValue)}</td>
    </tr>
  </table>
</body></html>`;
}
