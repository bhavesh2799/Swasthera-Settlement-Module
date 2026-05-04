import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const onboardingStatusEnum = pgEnum("onboarding_status", ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ACTIVE"]);
export const kybStatusEnum = pgEnum("kyb_status", ["NOT_STARTED", "PENDING", "PASSED", "FAILED"]);

export const onboardingsTable = pgTable("onboardings", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull().unique(),
  status: onboardingStatusEnum("status").notNull().default("DRAFT"),
  kybStatus: kybStatusEnum("kyb_status").notNull().default("NOT_STARTED"),
  companyName: text("company_name").notNull(),
  companyType: text("company_type").notNull(),
  pan: text("pan").notNull(),
  cin: text("cin"),
  masterGstin: text("master_gstin").notNull(),
  tan: text("tan"),
  bankAccount: text("bank_account").notNull(),
  bankIfsc: text("bank_ifsc").notNull(),
  bankName: text("bank_name").notNull(),
  spocName: text("spoc_name"),
  spocEmail: text("spoc_email"),
  spocMobile: text("spoc_mobile"),
  brandName: text("brand_name").notNull(),
  brandCategory: text("brand_category").notNull(),
  brandType: text("brand_type").notNull(),
  warehouseName: text("warehouse_name").notNull(),
  warehouseState: text("warehouse_state").notNull(),
  warehouseGstin: text("warehouse_gstin").notNull(),
  warehouseAddress: text("warehouse_address").notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
  commissionType: text("commission_type").notNull(),
  returnWindowDays: integer("return_window_days").notNull(),
  tcsRate: numeric("tcs_rate", { precision: 5, scale: 2 }).notNull(),
  tdsRate: numeric("tds_rate", { precision: 5, scale: 2 }).notNull(),
  docsUploaded: integer("docs_uploaded").notNull().default(0),
  docsRequired: integer("docs_required").notNull().default(5),
  submittedBy: text("submitted_by"),
  submittedAt: timestamp("submitted_at"),
  checkerName: text("checker_name"),
  checkerNotes: text("checker_notes"),
  reviewedAt: timestamp("reviewed_at"),
  fyndCompanyCode: text("fynd_company_code"),
  fyndBrandId: text("fynd_brand_id"),
  fyndLocationId: text("fynd_location_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOnboardingSchema = createInsertSchema(onboardingsTable).omit({ id: true, ref: true, createdAt: true, updatedAt: true });
export type InsertOnboarding = z.infer<typeof insertOnboardingSchema>;
export type Onboarding = typeof onboardingsTable.$inferSelect;
