import { pgTable, text, timestamp, boolean, integer, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { intentCategoriesTable } from "./categories";
import { agentsTable } from "./agents";

export const orchestratorRulesTable = pgTable("orchestrator_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"), // Clerk user ID of the owner; nullable for legacy seeded rows
  agentId: uuid("agent_id").references(() => agentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  promptTemplate: text("prompt_template").notNull().default(""),
  priority: integer("priority").notNull().default(0),
  requiresClarificationPrompt: text("requires_clarification_prompt").notNull().default(""),
  escalationTrigger: boolean("escalation_trigger").notNull().default(false),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const ruleCategoryLinksTable = pgTable("rule_category_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").notNull().references(() => orchestratorRulesTable.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => intentCategoriesTable.id, { onDelete: "cascade" }),
});

export const insertRuleSchema = createInsertSchema(orchestratorRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type OrchestratorRule = typeof orchestratorRulesTable.$inferSelect;
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type RuleCategoryLink = typeof ruleCategoryLinksTable.$inferSelect;
