import { pgTable, text, timestamp, boolean, integer, uuid, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const intentCategoriesTable = pgTable("intent_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"), // Clerk user ID of the owner; nullable for legacy seeded rows
  agentId: uuid("agent_id").references(() => agentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  description: text("description").notNull().default(""),
  examples: text("examples").array().notNull().default([]),
  confidenceThreshold: numeric("confidence_threshold").notNull().default("0.7"),
  keywords: text("keywords").array().notNull().default([]),
  isEnabled: boolean("is_enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCategorySchema = createInsertSchema(intentCategoriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type IntentCategory = typeof intentCategoriesTable.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
