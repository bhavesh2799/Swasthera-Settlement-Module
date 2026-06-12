import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const invoiceTypeEnum = pgEnum("invoice_type_enum", ["INVOICE", "CREDIT_NOTE"]);

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  invoiceType: invoiceTypeEnum("invoice_type").notNull().default("INVOICE"),
  orderId: text("order_id").notNull(),
  bagId: text("bag_id"),
  brandId: integer("brand_id").notNull(),
  brandName: text("brand_name"),
  gmv: numeric("gmv", { precision: 12, scale: 2 }).notNull().default("0"),
  commissionAmount: numeric("commission_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  gstOnCommission: numeric("gst_on_commission", { precision: 12, scale: 2 }).notNull().default("0"),
  tdsDeducted: numeric("tds_deducted", { precision: 12, scale: 2 }).notNull().default("0"),
  tcsCollected: numeric("tcs_collected", { precision: 12, scale: 2 }).notNull().default("0"),
  netPayable: numeric("net_payable", { precision: 12, scale: 2 }).notNull().default("0"),
  // ---- Customer-invoice snapshot (captured at generation time) ----
  invoiceDate: text("invoice_date"),
  customerName: text("customer_name"),
  customerAddress: text("customer_address"),
  customerStateCode: text("customer_state_code"),
  customerState: text("customer_state"),
  // Seller (brand/company) GSTIN and ship-from warehouse identity
  sellerGstin: text("seller_gstin"),
  warehouseName: text("warehouse_name"),
  warehouseGstin: text("warehouse_gstin"),
  warehouseState: text("warehouse_state"),
  warehouseStateCode: text("warehouse_state_code"),
  // Line item (one bag = one product line)
  productName: text("product_name"),
  hsnCode: text("hsn_code"),
  quantity: integer("quantity"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  taxableValue: numeric("taxable_value", { precision: 12, scale: 2 }),
  // GST breakup — INTRA (CGST+SGST) vs INTER (IGST)
  gstType: text("gst_type"),
  cgstRate: numeric("cgst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  cgstAmount: numeric("cgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  sgstRate: numeric("sgst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  sgstAmount: numeric("sgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  igstRate: numeric("igst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  igstAmount: numeric("igst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalInvoiceValue: numeric("total_invoice_value", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentMethod: text("payment_method"),
  platformName: text("platform_name"),
  platformGstin: text("platform_gstin"),
  // Snapshot of OMS order status at capture (delivered/returned/cancelled/in_transit)
  orderStatus: text("order_status"),
  // Settlement period link
  settlementCycle: text("settlement_cycle"),
  // For credit notes — links to the invoice being reversed
  originalInvoiceId: integer("original_invoice_id"),
  reason: text("reason"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export type Invoice = typeof invoicesTable.$inferSelect;
export type InsertInvoice = typeof invoicesTable.$inferInsert;
