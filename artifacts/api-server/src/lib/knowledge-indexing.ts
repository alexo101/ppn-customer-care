import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  knowledgeAssetsTable,
  knowledgeArticlesTable,
  knowledgeChunkAssetsTable,
  knowledgeChunksTable,
} from "@workspace/db";
import { logger } from "./logger";
import {
  createEmbeddingProvider,
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "./llm";
import {
  deleteKnowledgeAssetById,
  getKnowledgeAssetForProcessing,
  listKnowledgeAssets,
} from "./knowledge-assets";
import { describeKnowledgeImage } from "./llm/knowledge-vision";
import { knowledgeImagesEnabled } from "./knowledge-images";
import { sanitizeArticleHtml } from "./article-html";

type ArticleIndexStatus = "idle" | "indexing" | "ready" | "empty" | "error";

const DEFAULT_MAX_CHARS = 1_200;
const DEFAULT_OVERLAP = 150;
const EMBEDDING_BATCH_SIZE = 64;

export function readIndexedEmbeddingModel(model: string | null | undefined): string | null {
  return model?.trim() ? model.trim() : null;
}

export function articleNeedsReindex(
  article: { embeddingModel: string | null; indexStatus: string },
  model: string,
): boolean {
  if (readIndexedEmbeddingModel(article.embeddingModel) !== model) return true;
  return article.indexStatus === "error" || article.indexStatus === "idle" || article.indexStatus === "indexing";
}

export function chunkText(
  text: string,
  options: { maxChars?: number; overlap?: number } = {},
): string[] {
  const maxChars = Math.max(1, options.maxChars ?? DEFAULT_MAX_CHARS);
  const overlap = Math.max(0, Math.min(options.overlap ?? DEFAULT_OVERLAP, maxChars - 1));
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

async function replaceArticleChunks(
  articleId: string,
  chunks: string[],
  embeddings: number[][],
  assetIdsByChunk: string[][] = [],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(knowledgeChunksTable).where(eq(knowledgeChunksTable.articleId, articleId));
    if (chunks.length === 0) return;
    const inserted = await tx
      .insert(knowledgeChunksTable)
      .values(
        chunks.map((content, index) => ({
          articleId,
          chunkIndex: index,
          content,
          embedding: embeddings[index],
        })),
      )
      .returning({ id: knowledgeChunksTable.id, chunkIndex: knowledgeChunksTable.chunkIndex });
    const links = inserted.flatMap((chunk) =>
      (assetIdsByChunk[chunk.chunkIndex] ?? []).map((assetId) => ({
        chunkId: chunk.id,
        assetId,
      })),
    );
    if (links.length > 0) {
      await tx.insert(knowledgeChunkAssetsTable).values(links).onConflictDoNothing();
    }
  });
}

async function markIndex(
  articleId: string,
  status: ArticleIndexStatus,
  extra: Partial<typeof knowledgeArticlesTable.$inferInsert> = {},
) {
  await db
    .update(knowledgeArticlesTable)
    .set({
      indexStatus: status,
      indexError: status === "error" ? (extra.indexError ?? "Could not index this article.") : null,
      lastIndexedAt: status === "ready" || status === "empty" ? new Date() : null,
      chunkCount: extra.chunkCount,
      imageCount: extra.imageCount,
      imageFailedCount: extra.imageFailedCount,
      embeddingModel: extra.embeddingModel,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeArticlesTable.id, articleId));
}

export async function deleteArticleChunks(articleIds: string[]): Promise<void> {
  if (articleIds.length === 0) return;
  await db.delete(knowledgeChunksTable).where(inArray(knowledgeChunksTable.articleId, articleIds));
}

export async function indexArticle(
  articleId: string,
  embeddingProvider: EmbeddingProvider,
): Promise<void> {
  const [article] = await db
    .select()
    .from(knowledgeArticlesTable)
    .where(eq(knowledgeArticlesTable.id, articleId))
    .limit(1);
  if (!article) throw new Error(`Knowledge article ${articleId} was not found.`);
  if (article.status !== "published") {
    await deleteArticleChunks([articleId]);
    await markIndex(articleId, "idle", {
      chunkCount: 0,
      embeddingModel: null,
      indexError: null,
    });
    return;
  }

  await markIndex(articleId, "indexing", { indexError: null, chunkCount: 0 });

  try {
    const model = await embeddingProvider.resolveModel();
    const sanitized = sanitizeArticleHtml(article.bodyHtml);
    const assets = knowledgeImagesEnabled() ? await listKnowledgeAssets(article.id) : [];
    const referenced = new Set(sanitized.assetIds);
    const searchableImages: Array<{ id: string; text: string }> = [];
    let failedImageCount = 0;
    for (const asset of assets) {
      if (referenced.size > 0 && !referenced.has(asset.id)) {
        continue;
      }
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
            await db
              .update(knowledgeAssetsTable)
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
          description = asset.altText.trim() || "Image attached to the article.";
          await db
            .update(knowledgeAssetsTable)
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
      .map((image) => `[[image:${image.id}]] ${image.text}`)
      .join("\n\n");
    const text = [article.title.trim(), sanitized.text.trim(), imageText].filter(Boolean).join("\n\n");
    if (!text.trim()) {
      await replaceArticleChunks(articleId, [], []);
      await markIndex(articleId, "empty", {
        chunkCount: 0,
        imageCount: assets.length,
        imageFailedCount: failedImageCount,
        embeddingModel: model,
        indexError: null,
      });
      return;
    }

    const chunks = chunkText(text);
    const assetIdsByChunk = chunks.map((chunk) =>
      searchableImages.filter((image) => chunk.includes(`[[image:${image.id}]]`)).map((image) => image.id),
    );
    const embeddings: number[][] = [];
    for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
      const result = await embeddingProvider.embed(chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE));
      embeddings.push(...result.embeddings);
    }
    if (embeddings.length !== chunks.length) {
      throw new Error("Embedding count did not match knowledge chunk count.");
    }

    await replaceArticleChunks(articleId, chunks, embeddings, assetIdsByChunk);
    await markIndex(articleId, "ready", {
      chunkCount: chunks.length,
      imageCount: searchableImages.length,
      imageFailedCount: failedImageCount,
      embeddingModel: model,
      indexError: null,
    });
    logger.info({ articleId, chunks: chunks.length, model }, "Indexed knowledge article");
  } catch (error) {
    await markIndex(articleId, "error", {
      indexError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function reindexPublishedArticles(
  embeddingProvider: EmbeddingProvider,
): Promise<{ indexed: number; skipped: number; failed: number }> {
  const model = await embeddingProvider.resolveModel();
  const articles = await db
    .select()
    .from(knowledgeArticlesTable)
    .where(eq(knowledgeArticlesTable.status, "published"));
  const stale = articles.filter((article) => articleNeedsReindex(article, model));
  await deleteArticleChunks(stale.map((article) => article.id));
  for (const article of stale) {
    await markIndex(article.id, "indexing", {
      indexError: null,
      embeddingModel: null,
      chunkCount: 0,
    });
  }

  let indexed = 0;
  let failed = 0;
  for (const article of stale) {
    try {
      await indexArticle(article.id, embeddingProvider);
      indexed += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { articleId: article.id, error: error instanceof Error ? error.message : String(error) },
        "Could not re-index knowledge article",
      );
    }
  }
  return { indexed, skipped: articles.length - stale.length, failed };
}

export async function prepareKnowledgeEmbeddings(): Promise<void> {
  try {
    const provider = createEmbeddingProvider();
    const model = await provider.resolveModel();
    const result = await reindexPublishedArticles(provider);
    logger.info({ model, ...result }, "Prepared knowledge embeddings");
  } catch (error) {
    const message =
      error instanceof EmbeddingProviderError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    logger.error({ error: message }, "Could not prepare knowledge embeddings");
  }
}

export function queueArticleIndex(articleId: string): void {
  void (async () => {
    try {
      await indexArticle(articleId, createEmbeddingProvider());
    } catch (error) {
      logger.error(
        { articleId, error: error instanceof Error ? error.message : String(error) },
        "Could not index knowledge article",
      );
    }
  })();
}

export async function removeUnreferencedArticleAssets(
  articleId: string,
  referencedIds: string[],
): Promise<void> {
  const assets = await listKnowledgeAssets(articleId);
  const referenced = new Set(referencedIds);
  await Promise.all(
    assets
      .filter((asset) => !referenced.has(asset.id))
      .map((asset) => deleteKnowledgeAssetById(asset.id)),
  );
}
