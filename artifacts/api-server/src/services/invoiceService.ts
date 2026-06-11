import { db, invoicesTable, bagsTable, brandsTable } from "@workspace/db";
import { eq, and, desc, like } from "drizzle-orm";
import type { Invoice } from "@workspace/db";

const GST_ON_COMMISSION_RATE = 0.18;

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

function money(n: number): string {
  return n.toFixed(2);
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

interface BagRow {
  bagId: string;
  orderId: string;
  brandId: number;
  brandName: string;
  esp: string;
  qty: number;
  tcsAmount: string;
  tdsAmount: string;
}

interface BrandRow {
  id: number;
  brandCode: string | null;
  commissionRate: string;
  tcsRate: string;
  tdsRate: string;
}

/**
 * Computes invoice financials for a bag using the brand's commercial terms.
 * net_payable = gmv - commission - gst_on_commission - tds - tcs
 */
function computeFinancials(bag: BagRow, brand: BrandRow) {
  const gmv = num(bag.esp) * num(bag.qty);
  const commissionAmount = (gmv * num(brand.commissionRate)) / 100;
  const gstOnCommission = commissionAmount * GST_ON_COMMISSION_RATE;
  // Prefer the bag's pre-accrued amounts; fall back to brand rates.
  const tdsDeducted = num(bag.tdsAmount) || (gmv * num(brand.tdsRate)) / 100;
  const tcsCollected = num(bag.tcsAmount) || (gmv * num(brand.tcsRate)) / 100;
  const netPayable = gmv - commissionAmount - gstOnCommission - tdsDeducted - tcsCollected;
  return { gmv, commissionAmount, gstOnCommission, tdsDeducted, tcsCollected, netPayable };
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
    })
    .returning();
  return created;
}

/**
 * Generates a CREDIT_NOTE that reverses the original invoice for an order
 * (called on cancellation/return approval). Amounts are negated.
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

  const neg = (v: string) => money(-num(v));
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
      originalInvoiceId: original.id,
      reason,
    })
    .returning();
  return created;
}

/** Renders an invoice as a simple HTML document for download/preview. */
export function renderInvoiceHtml(inv: Invoice): string {
  const isCn = inv.invoiceType === "CREDIT_NOTE";
  const title = isCn ? "Credit Note" : "Tax Invoice";
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#475569">${label}</td><td style="padding:6px 12px;text-align:right;font-variant-numeric:tabular-nums">${value}</td></tr>`;
  const inr = (v: string) => `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${inv.invoiceNumber}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 4px">Swasthera — ${title}</h1>
  <p style="color:#64748b;margin:0 0 24px">${inv.invoiceNumber}</p>
  <p><strong>Brand:</strong> ${inv.brandName ?? inv.brandId}<br/>
     <strong>Order:</strong> ${inv.orderId}<br/>
     <strong>Generated:</strong> ${new Date(inv.generatedAt).toLocaleString("en-IN")}</p>
  ${inv.reason ? `<p style="color:#b45309"><strong>Reason:</strong> ${inv.reason}</p>` : ""}
  <table style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #e2e8f0">
    ${row("Gross Merchandise Value", inr(inv.gmv))}
    ${row("Commission", inr(inv.commissionAmount))}
    ${row("GST on Commission (18%)", inr(inv.gstOnCommission))}
    ${row("TDS Deducted", inr(inv.tdsDeducted))}
    ${row("TCS Collected", inr(inv.tcsCollected))}
    <tr style="border-top:2px solid #0f172a;font-weight:700">
      <td style="padding:10px 12px">Net Payable</td>
      <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${inr(inv.netPayable)}</td>
    </tr>
  </table>
</body></html>`;
}
