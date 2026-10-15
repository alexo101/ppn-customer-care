import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { knowledgeArticlesTable } from "./articles";
import { knowledgeChunksTable } from "./knowledge-chunks";

export const knowledgeAssetsTable = pgTable("knowledge_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => knowledgeArticlesTable.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  originalName: text("original_name").notNull().default("image"),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  checksum: text("checksum").notNull(),
  position: integer("position").notNull().default(0),
  altText: text("alt_text").notNull().default(""),
  ocrText: text("ocr_text").notNull().default(""),
  visionDescription: text("vision_description").notNull().default(""),
  processingStatus: text("processing_status").notNull().default("pending"),
  processingError: text("processing_error"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const knowledgeChunkAssetsTable = pgTable(
  "knowledge_chunk_assets",
  {
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => knowledgeChunksTable.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => knowledgeAssetsTable.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.chunkId, table.assetId] })],
);

export type KnowledgeAsset = typeof knowledgeAssetsTable.$inferSelect;
export type InsertKnowledgeAsset = typeof knowledgeAssetsTable.$inferInsert;
