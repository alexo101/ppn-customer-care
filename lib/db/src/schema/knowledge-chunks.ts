import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { knowledgeSourcesTable } from "./sources";
import { organizationsTable, teamsTable } from "./tenancy";

export const knowledgeChunksTable = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSourcesTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teamsTable.id, { onDelete: "cascade" }),
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
