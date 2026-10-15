import { and, eq, inArray, or } from "drizzle-orm";
import {
  db,
  agentsTable,
  knowledgeArticlesTable,
  knowledgeAssetsTable,
} from "@workspace/db";
import {
  deleteKnowledgeAsset,
  putKnowledgeAsset,
  readKnowledgeAsset,
  signKnowledgeAssetRead,
} from "./knowledge-asset-storage";
import {
  inspectKnowledgeImage,
  normalizeKnowledgeImage,
  knowledgeImagesEnabled,
  type KnowledgeImageInfo,
} from "./knowledge-images";

export type KnowledgeAssetView = {
  id: string;
  articleId: string;
  mimeType: string;
  originalName: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  position: number;
  altText: string;
  processingStatus: string;
  processingError: string | null;
  visionDescription: string;
};

export async function createKnowledgeAsset(input: {
  articleId: string;
  agentId: string;
  buffer: Buffer;
  mimeType?: string;
  originalName?: string;
  position?: number;
  altText?: string;
}): Promise<KnowledgeAssetView> {
  if (!knowledgeImagesEnabled()) {
    throw new Error("Screenshot knowledge is currently disabled.");
  }
  const normalized = await normalizeKnowledgeImage(input.buffer, input.mimeType);
  const info = normalized.info;
  const [existing] = await db
    .select()
    .from(knowledgeAssetsTable)
    .where(
      and(
        eq(knowledgeAssetsTable.articleId, input.articleId),
        eq(knowledgeAssetsTable.checksum, info.checksum),
      ),
    )
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(knowledgeAssetsTable)
      .set({
        position: input.position ?? existing.position,
        altText: input.altText ?? existing.altText,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeAssetsTable.id, existing.id))
      .returning();
    return toAsset(updated ?? existing);
  }

  const storageKey = `knowledge/${input.agentId}/${input.articleId}/${info.checksum}.${extensionFor(info)}`;
  await putKnowledgeAsset(storageKey, normalized.buffer, info.mimeType);
  try {
    const [asset] = await db
      .insert(knowledgeAssetsTable)
      .values({
        articleId: input.articleId,
        storageKey,
        mimeType: info.mimeType,
        originalName: input.originalName || "image",
        byteSize: normalized.buffer.length,
        width: info.width,
        height: info.height,
        checksum: info.checksum,
        position: input.position ?? 0,
        altText: input.altText ?? "",
        processingStatus: "pending",
      })
      .returning();
    if (!asset) throw new Error("Could not create the image record.");
    return toAsset(asset);
  } catch (error) {
    await deleteKnowledgeAsset(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function getAuthorizedKnowledgeAsset(
  assetId: string,
  userId: string,
  options: { workspace?: boolean } = {},
): Promise<{ asset: KnowledgeAssetView; url: string } | null> {
  const [row] = await db
    .select({ asset: knowledgeAssetsTable, article: knowledgeArticlesTable, agent: agentsTable })
    .from(knowledgeAssetsTable)
    .innerJoin(
      knowledgeArticlesTable,
      eq(knowledgeAssetsTable.articleId, knowledgeArticlesTable.id),
    )
    .innerJoin(agentsTable, eq(knowledgeArticlesTable.agentId, agentsTable.id))
    .where(
      and(
        eq(knowledgeAssetsTable.id, assetId),
        options.workspace
          ? undefined
          : or(
              eq(knowledgeArticlesTable.userId, userId),
              eq(agentsTable.userId, userId),
            ),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    asset: toAsset(row.asset),
    url: await signKnowledgeAssetRead(row.asset.storageKey),
  };
}

export async function getKnowledgeAssetForProcessing(assetId: string) {
  const [asset] = await db
    .select()
    .from(knowledgeAssetsTable)
    .where(eq(knowledgeAssetsTable.id, assetId))
    .limit(1);
  if (!asset) return null;
  return { asset, buffer: await readKnowledgeAsset(asset.storageKey) };
}

export async function getKnowledgeAssetContext(assetIds: string[]) {
  if (assetIds.length === 0) return [];
  const assets = await db
    .select()
    .from(knowledgeAssetsTable)
    .where(
      assetIds.length === 1
        ? eq(knowledgeAssetsTable.id, assetIds[0])
        : inArray(knowledgeAssetsTable.id, assetIds),
    );
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return (
    await Promise.all(
      assetIds.map(async (id) => {
        const asset = byId.get(id);
        if (!asset) return null;
        return {
          id: asset.id,
          mimeType: asset.mimeType,
          altText: asset.altText,
          url: await signKnowledgeAssetRead(asset.storageKey),
        };
      }),
    )
  ).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
}

export async function listKnowledgeAssets(articleId: string): Promise<KnowledgeAssetView[]> {
  const rows = await db
    .select()
    .from(knowledgeAssetsTable)
    .where(eq(knowledgeAssetsTable.articleId, articleId))
    .orderBy(knowledgeAssetsTable.position, knowledgeAssetsTable.createdAt);
  return rows.map(toAsset);
}

export async function deleteKnowledgeAssetsForArticle(articleId: string): Promise<void> {
  const rows = await db
    .select({ id: knowledgeAssetsTable.id, storageKey: knowledgeAssetsTable.storageKey })
    .from(knowledgeAssetsTable)
    .where(eq(knowledgeAssetsTable.articleId, articleId));
  await Promise.all(rows.map((row) => deleteKnowledgeAsset(row.storageKey).catch(() => undefined)));
}

export async function deleteKnowledgeAssetById(assetId: string): Promise<void> {
  const [asset] = await db
    .select({ id: knowledgeAssetsTable.id, storageKey: knowledgeAssetsTable.storageKey })
    .from(knowledgeAssetsTable)
    .where(eq(knowledgeAssetsTable.id, assetId))
    .limit(1);
  if (!asset) return;
  await deleteKnowledgeAsset(asset.storageKey).catch(() => undefined);
  await db.delete(knowledgeAssetsTable).where(eq(knowledgeAssetsTable.id, assetId));
}

export function toAsset(row: typeof knowledgeAssetsTable.$inferSelect): KnowledgeAssetView {
  return {
    id: row.id,
    articleId: row.articleId,
    mimeType: row.mimeType,
    originalName: row.originalName,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    position: row.position,
    altText: row.altText,
    processingStatus: row.processingStatus,
    processingError: row.processingError,
    visionDescription: row.visionDescription,
  };
}

function extensionFor(info: KnowledgeImageInfo): string {
  if (info.mimeType === "image/png") return "png";
  if (info.mimeType === "image/webp") return "webp";
  return "jpg";
}
