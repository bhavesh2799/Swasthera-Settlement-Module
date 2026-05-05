import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const warehousesTable = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull(),
  onboardingId: integer("onboarding_id").notNull(),
  // IDs
  warehouseCode: text("warehouse_code").unique(),
  // Warehouse details
  warehouseName: text("warehouse_name").notNull(),
  warehouseState: text("warehouse_state").notNull(),
  warehouseGstin: text("warehouse_gstin").notNull(),
  warehouseAddress: text("warehouse_address").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  // TCS filing state code derived from GSTIN
  stateCode: text("state_code"),
  // Fynd sync ID
  fyndLocationId: text("fynd_location_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Warehouse = typeof warehousesTable.$inferSelect;
export type InsertWarehouse = typeof warehousesTable.$inferInsert;
