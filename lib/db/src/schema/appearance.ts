import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { organizationsTable, teamsTable } from "./tenancy";

export const appearanceSettingsTable = pgTable("appearance_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  organizationId: uuid("organization_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teamsTable.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agentsTable.id, { onDelete: "cascade" }),
  websiteUrl: text("website_url"),
  ctaColor: text("cta_color").notNull().default("#0EA5E9"),
  backgroundColor: text("background_color").notNull().default("#F8FAFC"),
  logoUrl: text("logo_url"),
  importedAt: timestamp("imported_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAppearanceSchema = createInsertSchema(appearanceSettingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AppearanceSettings = typeof appearanceSettingsTable.$inferSelect;
export type InsertAppearance = z.infer<typeof insertAppearanceSchema>;
