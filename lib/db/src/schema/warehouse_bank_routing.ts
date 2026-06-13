import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Per-brand warehouse → bank-account routing (Task #11).
 *
 * Replaces the state-based jurisdiction mapping as the settlement routing source.
 * Finance maps each of a brand's warehouses to one of the brand's bank accounts;
 * many warehouses may point at one account, but a warehouse resolves to exactly
 * one account — enforced by the unique index on warehouseId. Warehouses with no
 * row here fall back to the brand's primary account at settlement time
 * (documented fallback, not a silent error).
 */
export const warehouseBankRoutingTable = pgTable("warehouse_bank_routing", {
  id: serial("id").primaryKey(),
  onboardingId: integer("onboarding_id").notNull(),
  // brandsTable.id the warehouse belongs to (for display/governance scoping).
  brandId: integer("brand_id").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  bankAccountId: integer("bank_account_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniqWarehouse: uniqueIndex("uniq_warehouse_routing_warehouse").on(t.warehouseId),
}));

export type WarehouseBankRouting = typeof warehouseBankRoutingTable.$inferSelect;
export type InsertWarehouseBankRouting = typeof warehouseBankRoutingTable.$inferInsert;
