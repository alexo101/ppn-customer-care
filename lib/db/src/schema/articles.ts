import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { audienceTargetsTable } from "./targets";

export const ARTICLE_STATUSES = ["draft", "published", "archived"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const knowledgeArticlesTable = pgTable("knowledge_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").references(() => audienceTargetsTable.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  bodyHtml: text("body_html").notNull().default(""),
  bodyText: text("body_text").notNull().default(""),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  indexStatus: text("index_status").notNull().default("idle"),
  indexError: text("index_error"),
  chunkCount: integer("chunk_count").notNull().default(0),
  imageCount: integer("image_count").notNull().default(0),
  imageFailedCount: integer("image_failed_count").notNull().default(0),
  embeddingModel: text("embedding_model"),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertKnowledgeArticleSchema = createInsertSchema(knowledgeArticlesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type KnowledgeArticle = typeof knowledgeArticlesTable.$inferSelect;
export type InsertKnowledgeArticle = z.infer<typeof insertKnowledgeArticleSchema>;

export function isArticleStatus(value: string): value is ArticleStatus {
  return (ARTICLE_STATUSES as readonly string[]).includes(value);
}
