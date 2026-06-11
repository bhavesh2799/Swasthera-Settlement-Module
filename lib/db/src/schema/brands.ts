import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const brandStatusEnum = pgEnum("brand_status", ["DRAFT", "ACTIVE", "INACTIVE", "PENDING_APPROVAL", "REJECTED"]);

export const brandsTable = pgTable("brands", {
  id: serial("id").primaryKey(),
  onboardingId: integer("onboarding_id").notNull(),
  // IDs
  companyId: text("company_id"),
  brandCode: text("brand_code").unique(),
  // Brand details
  brandName: text("brand_name").notNull(),
  brandLegalName: text("brand_legal_name"),
  brandCategory: text("brand_category").notNull(),
  brandType: text("brand_type").notNull(),
  status: brandStatusEnum("status").notNull().default("ACTIVE"),
  // Commercial terms
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  commissionType: text("commission_type").notNull().default("FLAT_PERCENT"),
  tierConfig: text("tier_config"),
  returnWindowDays: integer("return_window_days").notNull().default(15),
  tcsRate: numeric("tcs_rate", { precision: 5, scale: 2 }).notNull().default("1"),
  tdsRate: numeric("tds_rate", { precision: 5, scale: 2 }).notNull().default("1"),
  tcsApplicable: boolean("tcs_applicable").notNull().default(true),
  // Finance SPOC (brand level — BRD FIX 5)
  spocName: text("spoc_name"),
  spocEmail: text("spoc_email"),
  spocMobile: text("spoc_mobile"),
  // Brand–Company agreement / linkage (BRD FIX 5)
  brandCompanyAgreementUrl: text("brand_company_agreement_url"),
  // Fynd sync IDs
  fyndBrandId: text("fynd_brand_id"),
  // Maker-Checker: proposed edits awaiting checker approval (JSON of changed fields)
  pendingChanges: text("pending_changes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Brand = typeof brandsTable.$inferSelect;
export type InsertBrand = typeof brandsTable.$inferInsert;
