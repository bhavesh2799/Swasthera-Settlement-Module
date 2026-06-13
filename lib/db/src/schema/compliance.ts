import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tcsStatusEnum = pgEnum("tcs_status", ["Accrued", "Paid", "Filed"]);
export const tdsStatusEnum = pgEnum("tds_status", ["Pending", "Deposited", "Filed"]);
export const creditNoteStatusEnum = pgEnum("credit_note_status", ["AWAITING", "RECEIVED"]);

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
  paymentRef: text("payment_ref"),
  paymentDate: text("payment_date"),
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
  depositRef: text("deposit_ref"),
  depositDate: text("deposit_date"),
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

// ---------------------------------------------------------------------------
// Credit Note Register (Task #12) — credit-note-arrival-driven reversals.
//
// A reversal-eligible cancellation/return is logged here as AWAITING when the
// credit note is generated. The TCS/TDS/other-adjustment reversal does NOT post
// immediately. When finance marks the row RECEIVED (recording the actual arrival
// date), the reversal posts into the settlement cycle of the arrival month —
// replacing the old 7th-of-next-month statutory deadline timing.
// ---------------------------------------------------------------------------
export const creditNoteRegisterTable = pgTable("credit_note_register", {
  id: serial("id").primaryKey(),
  /** Onboarding/brand that owns the order. */
  onboardingId: integer("onboarding_id").notNull(),
  brandName: text("brand_name").notNull(),
  bagId: text("bag_id").notNull(),
  orderId: text("order_id").notNull(),
  /** Link to the generated credit-note invoice. */
  creditNoteInvoiceId: integer("credit_note_invoice_id"),
  creditNoteNumber: text("credit_note_number"),
  /** Scenario classification carried from the order flow (CANCELLED / RETURNED). */
  scenario: text("scenario").notNull(),
  /** The bag's original settlement cycle (where the order/tax was first accrued). */
  originalCycle: text("original_cycle").notNull(),
  status: creditNoteStatusEnum("status").notNull().default("AWAITING"),
  /** Expected CN arrival date (set when logged AWAITING). */
  expectedArrivalDate: text("expected_arrival_date"),
  /** Actual CN arrival date (set when marked RECEIVED). */
  actualArrivalDate: text("actual_arrival_date"),
  /** Settlement cycle the reversal posts into (derived from actualArrivalDate). */
  arrivalCycle: text("arrival_cycle"),
  /** Amounts to reverse (captured at AWAITING time from the bag). */
  tdsAmount: numeric("tds_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  tcsAmount: numeric("tcs_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  /** Credit-note net payable — the "other adjustment" deducted from cycle net. */
  cnAmount: numeric("cn_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  receivedAt: timestamp("received_at"),
});

export const insertCreditNoteRegisterSchema = createInsertSchema(creditNoteRegisterTable).omit({ id: true, createdAt: true });
export type InsertCreditNoteRegister = z.infer<typeof insertCreditNoteRegisterSchema>;
export type CreditNoteRegister = typeof creditNoteRegisterTable.$inferSelect;
