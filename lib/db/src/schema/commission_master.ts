import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionTypeEnum = pgEnum("commission_type_enum", ["FLAT_PERCENT", "TIERED", "SLAB", "GMV_TIER"]);
export const gmvTierTypeEnum = pgEnum("gmv_tier_type_enum", ["THRESHOLD", "CUMULATIVE"]);

export const commissionMasterTable = pgTable("commission_master", {
  id: serial("id").primaryKey(),
  onboardingId: integer("onboarding_id").notNull(),
  version: integer("version").notNull().default(1),
  commissionType: commissionTypeEnum("commission_type").notNull().default("FLAT_PERCENT"),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }),
  tierConfig: text("tier_config"),
  gmvTierType: gmvTierTypeEnum("gmv_tier_type"),
  // Tax & settlement terms (spec step 6 commercial terms)
  tdsRate: numeric("tds_rate", { precision: 5, scale: 2 }),
  tdsTan: text("tds_tan"),
  tdsLimit: numeric("tds_limit", { precision: 12, scale: 2 }).default("180000"),
  tcsRate: numeric("tcs_rate", { precision: 5, scale: 2 }),
  returnWindowDays: integer("return_window_days"),
  settlementHoldDays: integer("settlement_hold_days"),
  addendumDocUrl: text("addendum_doc_url"),
  effectiveFromDate: text("effective_from_date").notNull(),
  effectiveToDate: text("effective_to_date"),
  isCurrent: boolean("is_current").notNull().default(true),
  notes: text("notes"),
  agreedByMakerId: text("agreed_by_maker_id"),
  approvedByCheckerId: text("approved_by_checker_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommissionMasterSchema = createInsertSchema(commissionMasterTable).omit({ id: true, createdAt: true });
export type InsertCommissionMaster = z.infer<typeof insertCommissionMasterSchema>;
export type CommissionMaster = typeof commissionMasterTable.$inferSelect;
