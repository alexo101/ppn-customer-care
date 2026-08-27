import { eq, inArray } from "drizzle-orm";
import {
  db,
  knowledgeChunksTable,
  knowledgeChunkAssetsTable,
  knowledgeAssetsTable,
  knowledgeSourcesTable,
} from "@workspace/db";
import { logger } from "./logger";
import {
  createEmbeddingProvider,
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "./llm";
import { fetchKnowledgeSourceFromUrl } from "./fetch-google-source";
import {
  createKnowledgeAsset,
  deleteKnowledgeAssetById,
  getKnowledgeAssetForProcessing,
  listKnowledgeAssets,
} from "./knowledge-assets";
import { describeKnowledgeImage } from "./llm/knowledge-vision";
import { knowledgeImagesEnabled } from "./knowledge-images";

type SourceSyncStatus = "idle" | "syncing" | "ready" | "empty" | "error";

const DEFAULT_MAX_CHARS = 1_200;
const DEFAULT_OVERLAP = 150;
const EMBEDDING_BATCH_SIZE = 64;

export const INDEXABLE_SOURCE_TYPES = ["document", "article", "spreadsheet"] as const;

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

function readSyncStatus(config: Record<string, unknown>): SourceSyncStatus {
  const value = config.syncStatus;
  if (value === "idle" || value === "syncing" || value === "ready" || value === "empty" || value === "error") {
    return value;
  }
  return "idle";
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

async function resolveSourceText(
  source: typeof knowledgeSourcesTable.$inferSelect,
): Promise<{ text: string; itemCount: number; assetIds: string[] }> {
  const config = (source.connectionConfig ?? {}) as Record<string, unknown>;
  const configuredAssetIds = Array.isArray(config.assetIds)
    ? config.assetIds.filter((value): value is string => typeof value === "string")
    : [];
  if (
    (source.sourceType === "document" || source.sourceType === "spreadsheet")
    && typeof config.text === "string"
  ) {
    return { text: config.text.trim(), itemCount: config.text.trim() ? 1 : 0, assetIds: configuredAssetIds };
  }
  if (source.sourceType === "article" && typeof config.body === "string") {
    return { text: config.body.trim(), itemCount: config.body.trim() ? 1 : 0, assetIds: configuredAssetIds };
  }
  return { text: "", itemCount: 0, assetIds: configuredAssetIds };
}

export async function mergeRemoteSourceConfig(
  sourceType: string,
  config: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const url = typeof config.url === "string" ? config.url.trim() : "";
  if (!url) return null;
  if (sourceType !== "document" && sourceType !== "spreadsheet") return null;
  const fetched = await fetchKnowledgeSourceFromUrl(url);
  return {
    ...config,
    text: fetched.text,
    fileName: fetched.title,
    mimeType: fetched.mimeType,
    url: fetched.url,
  };
}

async function refreshRemoteSourceText(
  source: typeof knowledgeSourcesTable.$inferSelect,
): Promise<typeof knowledgeSourcesTable.$inferSelect> {
  const config = (source.connectionConfig ?? {}) as Record<string, unknown>;
  const url = typeof config.url === "string" ? config.url.trim() : "";
  if (!url || !source.agentId) return source;
  const fetched = await fetchKnowledgeSourceFromUrl(url);
  const existingAssets = await listKnowledgeAssets(source.id);
  const newAssetIds: string[] = [];
  for (const image of fetched.images) {
    const asset = await createKnowledgeAsset({
      sourceId: source.id,
      agentId: source.agentId,
      buffer: image.buffer,
      mimeType: image.mimeType,
      originalName: image.originalName,
      position: image.position,
    });
    newAssetIds.push(asset.id);
  }
  const merged = {
    ...config,
    text: fetched.text,
    fileName: fetched.title,
    mimeType: fetched.mimeType,
    url: fetched.url,
    assetIds: newAssetIds,
    imageCount: newAssetIds.length,
  };
  const patched = await patchConnectionConfig(source.id, merged);
  if (patched) {
    await Promise.all(
      existingAssets
        .filter((asset) => !newAssetIds.includes(asset.id))
        .map((asset) => deleteKnowledgeAssetById(asset.id)),
    );
  }
  return patched ?? source;
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
  assetIdsByChunk: string[][] = [],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.sourceId, sourceId));
    if (chunks.length > 0) {
      const inserted = await tx.insert(knowledgeChunksTable).values(
        chunks.map((content, index) => ({
          sourceId,
          chunkIndex: index,
          content,
          embedding: embeddings[index],
        })),
      ).returning({ id: knowledgeChunksTable.id, chunkIndex: knowledgeChunksTable.chunkIndex });
      const links = inserted.flatMap((chunk) =>
        (assetIdsByChunk[chunk.chunkIndex] ?? []).map((assetId) => ({
          chunkId: chunk.id,
          assetId,
        })),
      );
      if (links.length > 0) {
        await tx.insert(knowledgeChunkAssetsTable).values(links).onConflictDoNothing();
      }
    }
  });
}

async function markSync(
  sourceId: string,
  status: SourceSyncStatus,
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
    const current = await refreshRemoteSourceText(source);
    const resolved = await resolveSourceText(current);
    const assets = knowledgeImagesEnabled() ? await listKnowledgeAssets(current.id) : [];
    const searchableImages: Array<{ id: string; text: string }> = [];
    let failedImageCount = 0;
    for (const asset of assets) {
      let description = asset.visionDescription.trim();
      if (!description) {
        try {
          const stored = await getKnowledgeAssetForProcessing(asset.id);
          if (stored) {
            description = await describeKnowledgeImage({
              buffer: stored.buffer,
              mimeType: stored.asset.mimeType as "image/png" | "image/jpeg" | "image/webp",
              altText: stored.asset.altText,
            });
            await db.update(knowledgeAssetsTable)
              .set({
                visionDescription: description,
                processingStatus: "ready",
                processingError: null,
                updatedAt: new Date(),
              })
              .where(eq(knowledgeAssetsTable.id, asset.id));
          }
        } catch (error) {
          failedImageCount += 1;
          description = asset.altText.trim() || "Screenshot attached to the documentation.";
          await db.update(knowledgeAssetsTable)
            .set({
              processingStatus: "failed",
              processingError: error instanceof Error ? error.message : String(error),
              updatedAt: new Date(),
            })
            .where(eq(knowledgeAssetsTable.id, asset.id));
        }
      }
      if (description) searchableImages.push({ id: asset.id, text: description });
    }
    const imageText = searchableImages
      .map((image) => `[[screenshot:${image.id}]] ${image.text}`)
      .join("\n\n");
    const text = [resolved.text.trim(), imageText].filter(Boolean).join("\n\n");
    if (!text) {
      await replaceSourceChunks(sourceId, [], []);
      await markSync(sourceId, "empty", {
        itemCount: assets.length,
        imageCount: assets.length,
        imageFailedCount: failedImageCount,
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
    const assetIdsByChunk = chunks.map((chunk) =>
      searchableImages
        .filter((image) => chunk.includes(`[[screenshot:${image.id}]]`))
        .map((image) => image.id),
    );
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

    await replaceSourceChunks(sourceId, chunks, embeddings, assetIdsByChunk);
    await markSync(sourceId, "ready", {
      itemCount: resolved.itemCount + assets.length,
      imageCount: assets.length,
      imageFailedCount: failedImageCount,
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
