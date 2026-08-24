import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentSettingsTable = pgTable("agent_settings", {
  agentId: uuid("agent_id").primaryKey().references(() => agentsTable.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull().default(""),
  targetAudience: text("target_audience").notNull().default(""),
  llmProvider: text("llm_provider").notNull().default("openai"),
  llmModel: text("llm_model").notNull().default(""),
  temperature: text("temperature").notNull().default("0.2"),
  configuration: jsonb("configuration").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const agentDeploymentsTable = pgTable("agent_deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
