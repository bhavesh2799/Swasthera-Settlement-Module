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
  // For credit notes — links to the invoice being reversed
  originalInvoiceId: integer("original_invoice_id"),
  reason: text("reason"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export type Invoice = typeof invoicesTable.$inferSelect;
export type InsertInvoice = typeof invoicesTable.$inferInsert;
