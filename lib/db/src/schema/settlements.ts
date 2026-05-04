import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settlementStatusEnum = pgEnum("settlement_status", ["COMPUTED", "PENDING_APPROVAL", "APPROVED", "PAID"]);
export const payoutStatusEnum = pgEnum("payout_status", ["INITIATED", "UTR_RECORDED", "SETTLED"]);

export const settlementsTable = pgTable("settlements", {
  id: serial("id").primaryKey(),
  cycle: text("cycle").notNull(),
  onboardingId: integer("onboarding_id").notNull(),
  companyName: text("company_name").notNull(),
  brandName: text("brand_name").notNull(),
  bankAccount: text("bank_account").notNull(),
  bankIfsc: text("bank_ifsc").notNull(),
  bankName: text("bank_name").notNull(),
  eligibleBags: integer("eligible_bags").notNull(),
  bagIds: text("bag_ids").notNull().default("[]"),
  grossGmv: numeric("gross_gmv", { precision: 14, scale: 2 }).notNull(),
  brandPromotions: numeric("brand_promotions", { precision: 14, scale: 2 }).notNull().default("0"),
  netBeforeCommission: numeric("net_before_commission", { precision: 14, scale: 2 }).notNull(),
  commission: numeric("commission", { precision: 14, scale: 2 }).notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
  gstOnCommission: numeric("gst_on_commission", { precision: 14, scale: 2 }).notNull(),
  tcsAmount: numeric("tcs_amount", { precision: 14, scale: 2 }).notNull(),
  tdsAmount: numeric("tds_amount", { precision: 14, scale: 2 }).notNull(),
  mdrCharges: numeric("mdr_charges", { precision: 14, scale: 2 }).notNull().default("0"),
  penalty: numeric("penalty", { precision: 14, scale: 2 }).notNull().default("0"),
  netPayable: numeric("net_payable", { precision: 14, scale: 2 }).notNull(),
  status: settlementStatusEnum("status").notNull().default("COMPUTED"),
  financeNotes: text("finance_notes"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payoutsTable = pgTable("payouts", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id").notNull(),
  cycle: text("cycle").notNull(),
  companyName: text("company_name").notNull(),
  brandName: text("brand_name").notNull(),
  bankAccount: text("bank_account").notNull(),
  bankIfsc: text("bank_ifsc").notNull(),
  bankName: text("bank_name").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  transferMode: text("transfer_mode").notNull().default("NEFT"),
  paymentRef: text("payment_ref").notNull(),
  utr: text("utr"),
  bankAckAt: timestamp("bank_ack_at"),
  status: payoutStatusEnum("status").notNull().default("INITIATED"),
  initiatedAt: timestamp("initiated_at").notNull().defaultNow(),
  settledAt: timestamp("settled_at"),
  bagCount: integer("bag_count").notNull(),
  bagIds: text("bag_ids").notNull().default("[]"),
});

export const insertSettlementSchema = createInsertSchema(settlementsTable).omit({ id: true, createdAt: true });
export type InsertSettlement = z.infer<typeof insertSettlementSchema>;
export type Settlement = typeof settlementsTable.$inferSelect;

export const insertPayoutSchema = createInsertSchema(payoutsTable).omit({ id: true, initiatedAt: true });
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type Payout = typeof payoutsTable.$inferSelect;
