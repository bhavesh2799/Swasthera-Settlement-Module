import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Per-brand jurisdiction (state) → bank-account routing.
 *
 * When a settlement runs, each eligible order's jurisdiction (state code) is
 * matched against these rows to pick the destination bank account; unmapped
 * states fall back to the brand's primary account. Many states may point at one
 * account, but a state resolves to exactly one account per onboarding — enforced
 * by the unique (onboardingId, stateCode) index. In the denormalised model an
 * onboarding == the settling brand, so this is "one account per state per brand".
 */
export const bankAccountJurisdictionsTable = pgTable("bank_account_jurisdictions", {
  id: serial("id").primaryKey(),
  onboardingId: integer("onboarding_id").notNull(),
  // brandsTable.id the destination account is tagged to (for display/governance).
  brandId: integer("brand_id").notNull(),
  bankAccountId: integer("bank_account_id").notNull(),
  // GST state code (2 chars), e.g. "27" for Maharashtra.
  stateCode: text("state_code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniqOnboardingState: uniqueIndex("uniq_jurisdiction_onboarding_state").on(t.onboardingId, t.stateCode),
}));

export type BankAccountJurisdiction = typeof bankAccountJurisdictionsTable.$inferSelect;
export type InsertBankAccountJurisdiction = typeof bankAccountJurisdictionsTable.$inferInsert;
