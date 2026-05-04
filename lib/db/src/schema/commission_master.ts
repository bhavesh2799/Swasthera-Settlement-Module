import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionTypeEnum = pgEnum("commission_type_enum", ["FLAT_PERCENT", "TIERED"]);

export const commissionMasterTable = pgTable("commission_master", {
  id: serial("id").primaryKey(),
  onboardingId: integer("onboarding_id").notNull(),
  commissionType: commissionTypeEnum("commission_type").notNull().default("FLAT_PERCENT"),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }),
  tierConfig: text("tier_config"),
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
