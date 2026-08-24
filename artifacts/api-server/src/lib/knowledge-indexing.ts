import { eq, inArray } from "drizzle-orm";
import {
  db,
  knowledgeChunksTable,
  knowledgeSourcesTable,
} from "@workspace/db";
import { logger } from "./logger";
import {
  createEmbeddingProvider,
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "./llm";
import { browseConfluenceItems, fetchConfluenceDocuments } from "./confluence-knowledge";
import {
  joinKnowledgeDocuments,
  parseSelectedKnowledgeItems,
  readSyncStatus,
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

export const INDEXABLE_SOURCE_TYPES = ["document", "article", "notion", "confluence"] as const;

export type IndexableSourceType = (typeof INDEXABLE_SOURCE_TYPES)[number];

export function isIndexableSourceType(sourceType: string): sourceType is IndexableSourceType {
  return INDEXABLE_SOURCE_TYPES.includes(sourceType as IndexableSourceType);
}

export function readIndexedEmbeddingModel(
  config: Record<string, unknown> | null | undefined,
): string | null {
  const value = config?.embeddingModel;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function sourceNeedsReindex(
  config: Record<string, unknown> | null | undefined,
  model: string,
): boolean {
  const indexedModel = readIndexedEmbeddingModel(config);
  if (indexedModel !== model) return true;
  const status = readSyncStatus(config ?? {});
  return status === "error" || status === "idle" || status === "syncing";
}

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

async function deleteSourceChunks(sourceIds: string[]): Promise<void> {
  if (sourceIds.length === 0) return;
  await db
    .delete(knowledgeChunksTable)
    .where(inArray(knowledgeChunksTable.sourceId, sourceIds));
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
  if (!isIndexableSourceType(source.sourceType)) {
    logger.info(
      { sourceId, sourceType: source.sourceType },
      "Knowledge source is not indexable; skipping",
    );
    return;
  }

  await markSync(sourceId, "syncing", { lastError: null, lastSyncedAt: null });

  try {
    const model = await embeddingProvider.resolveModel();
    const { text, itemCount } = await resolveSourceText(source);
    if (!text) {
      await replaceSourceChunks(sourceId, [], []);
      await markSync(sourceId, "empty", {
        itemCount: 0,
        chunkCount: 0,
        embeddingModel: model,
        lastError: null,
      });
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

    await replaceSourceChunks(sourceId, chunks, embeddings);
    await markSync(sourceId, "ready", {
      itemCount,
      chunkCount: chunks.length,
      embeddingModel: model,
      lastError: null,
    });
    logger.info(
      { sourceId, chunks: chunks.length, sourceType: source.sourceType, model },
      "Indexed knowledge source",
    );
  } catch (error) {
    await markSync(sourceId, "error", {
      lastError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function reindexAllIndexableSources(
  embeddingProvider: EmbeddingProvider,
): Promise<{ indexed: number; skipped: number; failed: number }> {
  const model = await embeddingProvider.resolveModel();
  const sources = await db.select().from(knowledgeSourcesTable);
  const indexable = sources.filter((source) => isIndexableSourceType(source.sourceType));
  const staleIds = indexable
    .filter((source) =>
      sourceNeedsReindex(
        (source.connectionConfig ?? {}) as Record<string, unknown>,
        model,
      ),
    )
    .map((source) => source.id);

  await deleteSourceChunks(staleIds);
  for (const sourceId of staleIds) {
    await markSync(sourceId, "syncing", {
      lastError: null,
      lastSyncedAt: null,
      embeddingModel: null,
      chunkCount: 0,
    });
  }

  let indexed = 0;
  let failed = 0;
  for (const source of indexable) {
    if (!staleIds.includes(source.id)) continue;
    try {
      await indexSource(source.id, embeddingProvider);
      indexed += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        {
          sourceId: source.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Could not re-index knowledge source",
      );
    }
  }

  return {
    indexed,
    skipped: indexable.length - staleIds.length,
    failed,
  };
}

export async function markAllIndexableSourcesError(message: string): Promise<number> {
  const sources = await db.select().from(knowledgeSourcesTable);
  const indexable = sources.filter((source) => isIndexableSourceType(source.sourceType));
  for (const source of indexable) {
    await markSync(source.id, "error", { lastError: message });
  }
  return indexable.length;
}

export async function prepareKnowledgeEmbeddings(): Promise<void> {
  try {
    const provider = createEmbeddingProvider();
    const model = await provider.resolveModel();
    const result = await reindexAllIndexableSources(provider);
    logger.info({ model, ...result }, "Prepared knowledge embeddings");
  } catch (error) {
    const message =
      error instanceof EmbeddingProviderError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    try {
      const updated = await markAllIndexableSourcesError(message);
      logger.error(
        { error: message, sources: updated },
        "Could not prepare knowledge embeddings",
      );
    } catch (markError) {
      logger.error(
        {
          error: message,
          markError: markError instanceof Error ? markError.message : String(markError),
        },
        "Could not prepare knowledge embeddings",
      );
    }
  }
}
