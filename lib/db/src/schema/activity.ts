import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityLevelEnum = pgEnum("activity_level", ["info", "success", "warning", "system"]);

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  user: text("user").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityRef: text("entity_ref"),
  level: activityLevelEnum("level").notNull().default("info"),
});

export const insertActivitySchema = createInsertSchema(activityTable).omit({ id: true, timestamp: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityTable.$inferSelect;
