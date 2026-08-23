import { eq } from "drizzle-orm";
import {
  db,
  knowledgeChunksTable,
  knowledgeSourcesTable,
} from "@workspace/db";
import { logger } from "./logger";
import type { EmbeddingProvider } from "./llm";
import { browseConfluenceItems, fetchConfluenceDocuments } from "./confluence-knowledge";
import {
  joinKnowledgeDocuments,
  parseSelectedKnowledgeItems,
  type IntegrationSyncStatus,
  type SourceBrowseResult,
} from "./integration-knowledge";
import { browseNotionItems, fetchNotionDocuments } from "./notion-knowledge";
import {
  createReplitConnectorProxy,
  type ConnectorProxy,
  type SourceIntegrationName,
} from "./replit-integrations";

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

export async function browseIntegrationContent(
  connectorName: SourceIntegrationName,
  input: { query?: string; cursor?: string; spaceId?: string } = {},
  proxy: ConnectorProxy = createReplitConnectorProxy(connectorName),
): Promise<SourceBrowseResult> {
  if (connectorName === "notion") {
    return browseNotionItems(proxy, input);
  }
  return browseConfluenceItems(proxy, input);
}

async function resolveSourceText(
  source: typeof knowledgeSourcesTable.$inferSelect,
): Promise<{ text: string; itemCount: number }> {
  const config = (source.connectionConfig ?? {}) as Record<string, unknown>;
  if (source.sourceType === "document" && typeof config.text === "string") {
    return { text: config.text.trim(), itemCount: config.text.trim() ? 1 : 0 };
  }
  if (source.sourceType === "article" && typeof config.body === "string") {
    return { text: config.body.trim(), itemCount: config.body.trim() ? 1 : 0 };
  }
  if (source.sourceType === "notion" || source.sourceType === "confluence") {
    const selected = parseSelectedKnowledgeItems(config.selectedItems);
    if (selected.length === 0) return { text: "", itemCount: 0 };
    const proxy = createReplitConnectorProxy(source.sourceType);
    const documents =
      source.sourceType === "notion"
        ? await fetchNotionDocuments(proxy, selected)
        : await fetchConfluenceDocuments(proxy, selected);
    return { text: joinKnowledgeDocuments(documents), itemCount: documents.length };
  }
  return { text: "", itemCount: 0 };
}

async function patchConnectionConfig(
  sourceId: string,
  patch: Record<string, unknown>,
): Promise<typeof knowledgeSourcesTable.$inferSelect | null> {
  const [current] = await db
    .select()
    .from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, sourceId))
    .limit(1);
  if (!current) return null;
  const nextConfig = {
    ...((current.connectionConfig ?? {}) as Record<string, unknown>),
    ...patch,
  };
  const [updated] = await db
    .update(knowledgeSourcesTable)
    .set({ connectionConfig: nextConfig, updatedAt: new Date() })
    .where(eq(knowledgeSourcesTable.id, sourceId))
    .returning();
  return updated ?? null;
}

async function replaceSourceChunks(
  sourceId: string,
  chunks: string[],
  embeddings: number[][],
): Promise<void> {
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
}

function isIntegrationSource(sourceType: string): boolean {
  return sourceType === "notion" || sourceType === "confluence";
}

async function markSync(
  sourceId: string,
  status: IntegrationSyncStatus,
  extra: Record<string, unknown> = {},
) {
  await patchConnectionConfig(sourceId, {
    ...extra,
    syncStatus: status,
    lastError: status === "error" ? extra.lastError ?? null : null,
    lastSyncedAt:
      status === "ready" || status === "empty"
        ? new Date().toISOString()
        : status === "syncing"
          ? null
          : extra.lastSyncedAt,
  });
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

  if (isIntegrationSource(source.sourceType)) {
    await markSync(sourceId, "syncing", { lastError: null, lastSyncedAt: null });
  }

  try {
    const { text, itemCount } = await resolveSourceText(source);
    if (!text) {
      if (isIntegrationSource(source.sourceType)) {
        await replaceSourceChunks(sourceId, [], []);
        await markSync(sourceId, "empty", { itemCount: 0, chunkCount: 0, lastError: null });
      } else {
        logger.info(
          { sourceId, sourceType: source.sourceType },
          "Knowledge source has no indexable text; skipping",
        );
      }
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

    await replaceSourceChunks(sourceId, chunks, embeddings);
    if (isIntegrationSource(source.sourceType)) {
      await markSync(sourceId, "ready", {
        itemCount,
        chunkCount: chunks.length,
        lastError: null,
      });
    }
    logger.info(
      { sourceId, chunks: chunks.length, sourceType: source.sourceType },
      "Indexed knowledge source",
    );
  } catch (error) {
    if (isIntegrationSource(source.sourceType)) {
      await markSync(sourceId, "error", {
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}
