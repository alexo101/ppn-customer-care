import { pgTable, text, timestamp, boolean, integer, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { organizationsTable, teamsTable } from "./tenancy";

export const audienceTargetsTable = pgTable("audience_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  organizationId: uuid("organization_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teamsTable.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  matchMode: text("match_mode").notNull().default("all"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const targetConditionsTable = pgTable("target_conditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetId: uuid("target_id").notNull().references(() => audienceTargetsTable.id, { onDelete: "cascade" }),
  personType: text("person_type").notNull(),
  attribute: text("attribute").notNull(),
  operator: text("operator").notNull(),
  value: text("value").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAudienceTargetSchema = createInsertSchema(audienceTargetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTargetConditionSchema = createInsertSchema(targetConditionsTable).omit({
  id: true,
  createdAt: true,
});

export type AudienceTarget = typeof audienceTargetsTable.$inferSelect;
export type InsertAudienceTarget = z.infer<typeof insertAudienceTargetSchema>;
export type TargetCondition = typeof targetConditionsTable.$inferSelect;
export type InsertTargetCondition = z.infer<typeof insertTargetConditionSchema>;
