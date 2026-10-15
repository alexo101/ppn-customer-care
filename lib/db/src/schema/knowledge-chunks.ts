import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { knowledgeArticlesTable } from "./articles";

export const knowledgeChunksTable = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => knowledgeArticlesTable.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("knowledge_chunks_embedding_idx").using(
      "hnsw",
      sql`${table.embedding} vector_cosine_ops`,
    ),
  ],
);

export type KnowledgeChunk = typeof knowledgeChunksTable.$inferSelect;
export type InsertKnowledgeChunk = typeof knowledgeChunksTable.$inferInsert;
