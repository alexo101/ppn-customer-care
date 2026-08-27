import { pgTable, text, timestamp, jsonb, uuid, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const conversationsTable = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"), // Clerk user ID of the owner; nullable for legacy seeded rows
  agentId: uuid("agent_id").references(() => agentsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").notNull().default({}),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messagesTable = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orchestratorLogsTable = pgTable("orchestrator_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  messageId: uuid("message_id"),
  detectedCategory: text("detected_category").notNull().default(""),
  confidenceScore: text("confidence_score").notNull().default("0"),
  secondaryCategories: text("secondary_categories").array().notNull().default([]),
  detectedEntities: jsonb("detected_entities").notNull().default({}),
  ruleUsed: text("rule_used").notNull().default("None"),
  dataSourcesQueried: text("data_sources_queried").array().notNull().default([]),
  promptAssembled: text("prompt_assembled").notNull().default(""),
  tokensUsed: text("tokens_used").notNull().default("0"),
  latencyMs: text("latency_ms").notNull().default("0"),
  llmModel: text("llm_model").notNull().default("simulated-v1"),
  resolutionStatus: text("resolution_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationFeedbackTable = pgTable("conversation_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  messageId: uuid("message_id"),
  rating: text("rating").notNull(), // 'positive' | 'negative'
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationAnalyticsTable = pgTable("conversation_analytics", {
  conversationId: uuid("conversation_id").primaryKey().references(() => conversationsTable.id, { onDelete: "cascade" }),
  resolutionStatus: text("resolution_status").notNull(),
  resolutionTimeMs: integer("resolution_time_ms"),
  interactionCount: integer("interaction_count").notNull().default(0),
  sourcesUsed: text("sources_used").array().notNull().default([]),
  connectorsUsed: text("connectors_used").array().notNull().default([]),
  totalTokens: integer("total_tokens").notNull().default(0),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 8 }).notNull().default("0"),
  feedbackRating: text("feedback_rating"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ id: true, createdAt: true, lastActivityAt: true });
export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export const insertLogSchema = createInsertSchema(orchestratorLogsTable).omit({ id: true, createdAt: true });
export const insertFeedbackSchema = createInsertSchema(conversationFeedbackTable).omit({ id: true, createdAt: true });

export type Conversation = typeof conversationsTable.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messagesTable.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type OrchestratorLog = typeof orchestratorLogsTable.$inferSelect;
export type ConversationFeedback = typeof conversationFeedbackTable.$inferSelect;
export type ConversationAnalytics = typeof conversationAnalyticsTable.$inferSelect;
