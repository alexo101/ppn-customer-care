import { eq } from "drizzle-orm";
import {
  db,
  knowledgeChunksTable,
  knowledgeSourcesTable,
} from "@workspace/db";
import { logger } from "./logger";
import type { EmbeddingProvider } from "./llm";

const DEFAULT_MAX_CHARS = 1_200;
const DEFAULT_OVERLAP = 150;
const EMBEDDING_BATCH_SIZE = 64;

export function chunkText(
  text: string,
  options: { maxChars?: number; overlap?: number } = {},
): string[] {
  const maxChars = Math.max(1, options.maxChars ?? DEFAULT_MAX_CHARS);
  const overlap = Math.max(
    0,
    Math.min(options.overlap ?? DEFAULT_OVERLAP, maxChars - 1),
  );
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      if (!current) {
        current = paragraph;
      } else if (current.length + 1 + paragraph.length <= maxChars) {
        current += ` ${paragraph}`;
      } else {
        chunks.push(current);
        current = paragraph;
      }
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }
    for (let start = 0; start < paragraph.length; start += maxChars - overlap) {
      const piece = paragraph.slice(start, start + maxChars).trim();
      if (piece) chunks.push(piece);
      if (start + maxChars >= paragraph.length) break;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

export async function indexSource(
  sourceId: string,
  embeddingProvider: EmbeddingProvider,
): Promise<void> {
  const [source] = await db
    .select()
    .from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, sourceId))
    .limit(1);
  if (!source) throw new Error(`Knowledge source ${sourceId} was not found.`);

  const config = source.connectionConfig as Record<string, unknown>;
  const text = source.sourceType === "document" && typeof config.text === "string"
    ? config.text.trim()
    : "";
  if (!text) {
    logger.info(
      { sourceId, sourceType: source.sourceType },
      "Knowledge source has no indexable text; skipping",
    );
    return;
  }

  const chunks = chunkText(text);
  const embeddings: number[][] = [];
  for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
    const result = await embeddingProvider.embed(
      chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE),
    );
    embeddings.push(...result.embeddings);
  }
  if (embeddings.length !== chunks.length) {
    throw new Error("Embedding count did not match knowledge chunk count.");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.sourceId, sourceId));
    if (chunks.length > 0) {
      await tx.insert(knowledgeChunksTable).values(
        chunks.map((content, index) => ({
          sourceId,
          chunkIndex: index,
          content,
          embedding: embeddings[index],
        })),
      );
    }
  });
  logger.info(
    { sourceId, chunks: chunks.length },
    "Indexed knowledge source",
  );
}
