import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountTypeEnum = pgEnum("bank_account_type", ["current", "savings"]);

export const bankAccountsTable = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull(),
  onboardingId: integer("onboarding_id").notNull(),
  accountNumber: text("account_number").notNull(),
  ifsc: text("ifsc").notNull(),
  bankName: text("bank_name").notNull(),
  branchName: text("branch_name"),
  accountType: accountTypeEnum("account_type").notNull().default("current"),
  isPrimary: boolean("is_primary").notNull().default(false),
  // Maker-Checker governance: ACTIVE | PENDING_APPROVAL | REJECTED
  status: text("status").notNull().default("ACTIVE"),
  // Proposed edits awaiting checker approval (JSON of changed fields)
  pendingChanges: text("pending_changes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBankAccountSchema = createInsertSchema(bankAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccountsTable.$inferSelect;
