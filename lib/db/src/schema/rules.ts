import { pgTable, text, timestamp, boolean, integer, uuid, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { intentCategoriesTable } from "./categories";
import { knowledgeSourcesTable } from "./sources";
import { agentsTable } from "./agents";
import { audienceTargetsTable } from "./targets";

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
  conditionOperator: text("condition_operator").notNull().default("is"),
  action: text("action").notNull().default("search answer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const ruleVocabulariesTable = pgTable("rule_vocabularies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  agentId: uuid("agent_id").references(() => agentsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // operator | action
  label: text("label").notNull(),
  slug: text("slug").notNull(),
  requiresSource: boolean("requires_source").notNull().default(false),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const ruleCategoryLinksTable = pgTable("rule_category_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").notNull().references(() => orchestratorRulesTable.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => intentCategoriesTable.id, { onDelete: "cascade" }),
}, (table) => [
  unique("rule_category_links_rule_id_category_id").on(table.ruleId, table.categoryId),
]);

export const ruleSourceLinksTable = pgTable("rule_source_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").notNull().references(() => orchestratorRulesTable.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").notNull().references(() => knowledgeSourcesTable.id, { onDelete: "cascade" }),
}, (table) => [
  unique("rule_source_links_rule_id_source_id").on(table.ruleId, table.sourceId),
]);

export const ruleAudienceTargetLinksTable = pgTable("rule_audience_target_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").notNull().references(() => orchestratorRulesTable.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").notNull().references(() => audienceTargetsTable.id, { onDelete: "cascade" }),
}, (table) => [
  unique("rule_audience_target_links_rule_id_target_id").on(table.ruleId, table.targetId),
]);

export const insertRuleSchema = createInsertSchema(orchestratorRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRuleVocabularySchema = createInsertSchema(ruleVocabulariesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type OrchestratorRule = typeof orchestratorRulesTable.$inferSelect;
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type RuleCategoryLink = typeof ruleCategoryLinksTable.$inferSelect;
export type RuleSourceLink = typeof ruleSourceLinksTable.$inferSelect;
export type RuleAudienceTargetLink = typeof ruleAudienceTargetLinksTable.$inferSelect;
export type RuleVocabulary = typeof ruleVocabulariesTable.$inferSelect;
export type InsertRuleVocabulary = z.infer<typeof insertRuleVocabularySchema>;
