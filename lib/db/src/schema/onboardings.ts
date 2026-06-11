import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const onboardingStatusEnum = pgEnum("onboarding_status", ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ACTIVE"]);
export const kybStatusEnum = pgEnum("kyb_status", ["NOT_STARTED", "PENDING", "PASSED", "FAILED"]);

export const onboardingsTable = pgTable("onboardings", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull().unique(),
  status: onboardingStatusEnum("status").notNull().default("DRAFT"),
  kybStatus: kybStatusEnum("kyb_status").notNull().default("NOT_STARTED"),
  // Company details
  companyName: text("company_name").notNull(),
  tradeName: text("trade_name"),
  companyType: text("company_type").notNull(),
  pan: text("pan").notNull(),
  cin: text("cin"),
  llpCode: text("llp_code"),
  masterGstin: text("master_gstin").notNull(),
  gstAvailable: boolean("gst_available").notNull().default(true),
  tan: text("tan"),
  registeredAddress: text("registered_address"),
  stateCode: text("state_code"),
  // GSTIN-fetch / KYB prefill fields (BRD FIX 4)
  entityTypeOther: text("entity_type_other"),
  registrationStatus: text("registration_status"),
  dateOfRegistration: text("date_of_registration"),
  taxpayerType: text("taxpayer_type"),
  jurisdictionCode: text("jurisdiction_code"),
  natureOfBusiness: text("nature_of_business"),
  // Brand details
  brandName: text("brand_name").notNull(),
  brandLegalName: text("brand_legal_name"),
  brandCategory: text("brand_category").notNull(),
  brandType: text("brand_type").notNull(),
  tcsApplicable: boolean("tcs_applicable").notNull().default(true),
  // Banking
  bankAccount: text("bank_account").notNull(),
  bankIfsc: text("bank_ifsc").notNull(),
  bankName: text("bank_name").notNull(),
  // SPOC
  spocName: text("spoc_name"),
  spocEmail: text("spoc_email"),
  spocMobile: text("spoc_mobile"),
  // Warehouse
  warehouseName: text("warehouse_name").notNull(),
  warehouseState: text("warehouse_state").notNull(),
  warehouseGstin: text("warehouse_gstin").notNull(),
  warehouseAddress: text("warehouse_address").notNull(),
  // Commercial terms
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
  commissionType: text("commission_type").notNull(),
  returnWindowDays: integer("return_window_days").notNull(),
  tcsRate: numeric("tcs_rate", { precision: 5, scale: 2 }).notNull(),
  tdsRate: numeric("tds_rate", { precision: 5, scale: 2 }).notNull(),
  // MDR (Merchant Discount Rate) — payment-gateway charge applied as % of GMV at settlement.
  mdrRate: numeric("mdr_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  // Document uploads (6 required per BRD)
  panDocUrl: text("pan_doc_url"),
  gstCertUrl: text("gst_cert_url"),
  cinDocUrl: text("cin_doc_url"),
  cancelledChequeUrl: text("cancelled_cheque_url"),
  signedAgreementUrl: text("signed_agreement_url"),
  digitalSignatureUrl: text("digital_signature_url"),
  msmeCertUrl: text("msme_cert_url"),
  tanCopyUrl: text("tan_copy_url"),
  // Extra ad-hoc documents: [{ label, url, level: "company"|"brand"|"warehouse" }]
  extraDocuments: text("extra_documents"),
  docsUploaded: integer("docs_uploaded").notNull().default(0),
  docsRequired: integer("docs_required").notNull().default(6),
  // Maker-Checker resubmission version (BRD FIX 7)
  version: integer("version").notNull().default(1),
  // Post-approval change governance: proposed company/document field edits
  // awaiting checker approval (JSON of changed fields). Does NOT touch status.
  pendingChanges: text("pending_changes"),
  // KYB tracking
  kybVerifiedAt: timestamp("kyb_verified_at"),
  kybAttempts: integer("kyb_attempts").notNull().default(0),
  // Workflow
  submittedBy: text("submitted_by"),
  submittedAt: timestamp("submitted_at"),
  checkerName: text("checker_name"),
  checkerNotes: text("checker_notes"),
  reviewedAt: timestamp("reviewed_at"),
  // Fynd sync IDs (post-approval)
  fyndCompanyCode: text("fynd_company_code"),
  fyndBrandId: text("fynd_brand_id"),
  fyndLocationId: text("fynd_location_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOnboardingSchema = createInsertSchema(onboardingsTable).omit({ id: true, ref: true, createdAt: true, updatedAt: true });
export type InsertOnboarding = z.infer<typeof insertOnboardingSchema>;
export type Onboarding = typeof onboardingsTable.$inferSelect;
