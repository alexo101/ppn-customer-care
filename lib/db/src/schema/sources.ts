import { pgTable, text, timestamp, boolean, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const knowledgeSourcesTable = pgTable("knowledge_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"), // Clerk user ID of the owner; nullable for legacy seeded rows
  agentId: uuid("agent_id").references(() => agentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  connectionConfig: jsonb("connection_config").notNull().default({}),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const apiConnectorsTable = pgTable("api_connectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"), // Clerk user ID of the owner; nullable for legacy seeded rows
  agentId: uuid("agent_id").references(() => agentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  endpointPattern: text("endpoint_pattern").notNull(),
  authType: text("auth_type").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSourceSchema = createInsertSchema(knowledgeSourcesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertConnectorSchema = createInsertSchema(apiConnectorsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type KnowledgeSource = typeof knowledgeSourcesTable.$inferSelect;
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type ApiConnector = typeof apiConnectorsTable.$inferSelect;
export type InsertConnector = z.infer<typeof insertConnectorSchema>;
