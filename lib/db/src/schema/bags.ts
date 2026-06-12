import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bagEligibilityEnum = pgEnum("bag_eligibility", ["eligible", "in_window", "on_hold", "settled", "awaiting_delivery"]);

export const bagsTable = pgTable("bags", {
  id: serial("id").primaryKey(),
  bagId: text("bag_id").notNull().unique(),
  orderId: text("order_id").notNull(),
  brandId: integer("brand_id").notNull(),
  brandName: text("brand_name").notNull(),
  sku: text("sku").notNull(),
  esp: numeric("esp", { precision: 12, scale: 2 }).notNull(),
  qty: integer("qty").notNull().default(1),
  omsState: text("oms_state").notNull(),
  invoiceDate: text("invoice_date"),
  deliveryDate: text("delivery_date"),
  windowExpiryDate: text("window_expiry_date"),
  tcsAmount: numeric("tcs_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  tdsAmount: numeric("tds_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  eligibility: bagEligibilityEnum("eligibility").notNull().default("awaiting_delivery"),
  cycle: text("cycle").notNull(),
  stateCode: text("state_code").notNull(),
  stateGstin: text("state_gstin").notNull(),
  // OMS order attributes — customer / ship-to & payment (source for customer invoice)
  customerName: text("customer_name"),
  customerAddress: text("customer_address"),
  customerStateCode: text("customer_state_code"),
  customerState: text("customer_state"),
  paymentMethod: text("payment_method"),
  settledAt: timestamp("settled_at"),
  // Order-reversal lifecycle (Task #7). null = no reversal action taken.
  // CANCELLED (pre-delivery void), RETURN_INITIATED / RETURNED / RETURN_REJECTED
  // (after-delivery return journey), WINDOW_EXPIRED_REJECTED (past return window).
  reversalStatus: text("reversal_status"),
  reversalReason: text("reversal_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBagSchema = createInsertSchema(bagsTable).omit({ id: true, createdAt: true });
export type InsertBag = z.infer<typeof insertBagSchema>;
export type Bag = typeof bagsTable.$inferSelect;
