import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settlementStatusEnum = pgEnum("settlement_status", ["COMPUTED", "PENDING_APPROVAL", "APPROVED", "PAID"]);
export const payoutStatusEnum = pgEnum("payout_status", ["PENDING_APPROVAL", "INITIATED", "UTR_RECORDED", "SETTLED"]);

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
  // Sequential per-brand settlement-invoice number (BRANDCODE-STL-YYYY-NNNN),
  // assigned on first PDF download and persisted so re-downloads are stable.
  // Uniqueness is guaranteed by the sequential per-brand generator.
  invoiceNumber: text("invoice_number"),
  // Waterfall fields
  grossGmv: numeric("gross_gmv", { precision: 14, scale: 2 }).notNull(),
  brandPromotions: numeric("brand_promotions", { precision: 14, scale: 2 }).notNull().default("0"),
  marketplacePromotions: numeric("marketplace_promotions", { precision: 14, scale: 2 }).notNull().default("0"),
  netBeforeCommission: numeric("net_before_commission", { precision: 14, scale: 2 }).notNull(),
  commission: numeric("commission", { precision: 14, scale: 2 }).notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
  gstOnCommission: numeric("gst_on_commission", { precision: 14, scale: 2 }).notNull(),
  tcsAmount: numeric("tcs_amount", { precision: 14, scale: 2 }).notNull(),
  tdsAmount: numeric("tds_amount", { precision: 14, scale: 2 }).notNull(),
  mdrCharges: numeric("mdr_charges", { precision: 14, scale: 2 }).notNull().default("0"),
  // Resolved MDR rate (%) applied for this run — persisted for audit alongside mdrCharges.
  mdrRate: numeric("mdr_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  penalty: numeric("penalty", { precision: 14, scale: 2 }).notNull().default("0"),
  netPayable: numeric("net_payable", { precision: 14, scale: 2 }).notNull(),
  // Negative-net handling: if the raw net is below zero we never pay out a
  // negative amount — net_payable is clamped to 0 and the deficit is recorded
  // here (negative) to be carried forward into the next cycle (spec MODULE 3).
  carryForward: numeric("carry_forward", { precision: 14, scale: 2 }).notNull().default("0"),
  // Payout hold (stop-payout) — pauses the cycle without deleting it.
  onHold: boolean("on_hold").notNull().default(false),
  holdReason: text("hold_reason"),
  // Approval workflow
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
  status: payoutStatusEnum("status").notNull().default("PENDING_APPROVAL"),
  // Payout-level approval audit
  initiatedBy: text("initiated_by"),
  initiatedAt: timestamp("initiated_at").notNull().defaultNow(),
  payoutApprovedBy: text("payout_approved_by"),
  payoutApprovedAt: timestamp("payout_approved_at"),
  payoutNotes: text("payout_notes"),
  settledAt: timestamp("settled_at"),
  bagCount: integer("bag_count").notNull(),
  bagIds: text("bag_ids").notNull().default("[]"),
});

// ---------------------------------------------------------------------------
// Settlement Adjustments — structured records for events that affect a brand's
// net payable for a given cycle but happen outside the main settlement compute
// run (credit notes issued on returns/cancellations; blocked TDS/TCS that was
// already deposited). The compute route sums these before calling the calculator
// so the final waterfall reflects all in-cycle adjustments.
// ---------------------------------------------------------------------------
export const settlementAdjustmentsTable = pgTable("settlement_adjustments", {
  id: serial("id").primaryKey(),
  /** Onboarding that owns the brand. Used to link adjustments to the right settlement. */
  onboardingId: integer("onboarding_id").notNull(),
  /** Settlement cycle the adjustment belongs to (e.g. "MAY-2026-C1" or "2026-05"). */
  cycle: text("cycle").notNull(),
  /** The bag that triggered this adjustment. */
  bagId: text("bag_id").notNull(),
  /** Set once the adjustment has been consumed by a settlement compute run. */
  settlementId: integer("settlement_id"),
  /**
   * CREDIT_NOTE          — brand owes this amount back; deducted from cycle net.
   * TDS_CARRY_FORWARD    — TDS that cannot be reversed (past the 7th); will be
   *                        deducted from the next cycle's settlement instead.
   * TCS_CARRY_FORWARD    — same, for TCS.
   */
  adjustmentType: text("adjustment_type").notNull(),
  /** Positive amount (the deduction magnitude). Applied as a reduction from rawNet. */
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SettlementAdjustment = typeof settlementAdjustmentsTable.$inferSelect;

export const insertSettlementSchema = createInsertSchema(settlementsTable).omit({ id: true, createdAt: true });
export type InsertSettlement = z.infer<typeof insertSettlementSchema>;
export type Settlement = typeof settlementsTable.$inferSelect;

export const insertPayoutSchema = createInsertSchema(payoutsTable).omit({ id: true, initiatedAt: true });
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type Payout = typeof payoutsTable.$inferSelect;
