import { pgTable, serial, text, integer, numeric, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tcsStatusEnum = pgEnum("tcs_status", ["Accrued", "Paid", "Filed"]);
export const tdsStatusEnum = pgEnum("tds_status", ["Pending", "Deposited", "Filed"]);

export const tcsRecordsTable = pgTable("tcs_records", {
  id: serial("id").primaryKey(),
  month: text("month").notNull(),
  year: integer("year").notNull(),
  stateGstin: text("state_gstin").notNull(),
  stateCode: text("state_code").notNull(),
  stateName: text("state_name").notNull(),
  brandName: text("brand_name").notNull(),
  taxableSupply: numeric("taxable_supply", { precision: 14, scale: 2 }).notNull(),
  tcsRate: numeric("tcs_rate", { precision: 5, scale: 2 }).notNull(),
  tcsAmount: numeric("tcs_amount", { precision: 14, scale: 2 }).notNull(),
  status: tcsStatusEnum("status").notNull().default("Accrued"),
  paymentDueDate: text("payment_due_date").notNull(),
  // Reversal tracking (BRD §5.4)
  isReversal: boolean("is_reversal").notNull().default(false),
  reversalReason: text("reversal_reason"),
  originalBagId: text("original_bag_id"),
});

export const tdsRecordsTable = pgTable("tds_records", {
  id: serial("id").primaryKey(),
  month: text("month").notNull(),
  year: integer("year").notNull(),
  companyName: text("company_name").notNull(),
  tan: text("tan").notNull(),
  grossPayment: numeric("gross_payment", { precision: 14, scale: 2 }).notNull(),
  tdsRate: numeric("tds_rate", { precision: 5, scale: 2 }).notNull(),
  tdsAmount: numeric("tds_amount", { precision: 14, scale: 2 }).notNull(),
  netPaid: numeric("net_paid", { precision: 14, scale: 2 }).notNull(),
  status: tdsStatusEnum("status").notNull().default("Pending"),
  // Reversal tracking (BRD §5.4)
  isReversal: boolean("is_reversal").notNull().default(false),
  reversalReason: text("reversal_reason"),
  originalBagId: text("original_bag_id"),
});

export const insertTcsRecordSchema = createInsertSchema(tcsRecordsTable).omit({ id: true });
export type InsertTcsRecord = z.infer<typeof insertTcsRecordSchema>;
export type TcsRecord = typeof tcsRecordsTable.$inferSelect;

export const insertTdsRecordSchema = createInsertSchema(tdsRecordsTable).omit({ id: true });
export type InsertTdsRecord = z.infer<typeof insertTdsRecordSchema>;
export type TdsRecord = typeof tdsRecordsTable.$inferSelect;
