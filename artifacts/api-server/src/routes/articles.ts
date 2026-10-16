import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import multer from "multer";
import { z } from "zod";
import {
  audienceTargetsTable,
  db,
  knowledgeArticlesTable,
  knowledgeAssetsTable,
} from "@workspace/db";
import {
  ArchiveArticleParams,
  CreateArticleBody,
  DeleteArticleAssetParams,
  DeleteArticleParams,
  GetArticleAssetUrlParams,
  ListArticleAssetsParams,
  ListArticlesQueryParams,
  PublishArticleParams,
  RestoreArticleDraftParams,
  UpdateArticleBody,
  UpdateArticleParams,
} from "@workspace/api-zod";
import {
  requireAuth,
  requireAuthOrDeployment,
  requireEditor,
} from "../middlewares/requireAuth";
import { getOwnedAgent } from "../lib/agents";
import { articleHasContent, sanitizeArticleHtml } from "../lib/article-html";
import {
  createKnowledgeAsset,
  deleteKnowledgeAssetById,
  deleteKnowledgeAssetsForArticle,
  getAuthorizedKnowledgeAsset,
  listKnowledgeAssets,
} from "../lib/knowledge-assets";
import {
  KNOWLEDGE_IMAGE_MAX_BYTES,
  inspectKnowledgeImage,
  knowledgeImagesEnabled,
} from "../lib/knowledge-images";
import { KnowledgeAssetStorageError } from "../lib/knowledge-asset-storage";
import {
  deleteArticleChunks,
  queueArticleIndex,
  removeUnreferencedArticleAssets,
} from "../lib/knowledge-indexing";

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: KNOWLEDGE_IMAGE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg" || file.mimetype === "image/webp") {
      cb(null, true);
      return;
    }
    cb(new Error("Only PNG, JPEG, and WebP images are supported"));
  },
});

const router: IRouter = Router();

router.get("/articles", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListArticlesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res))) return;

  const filters = [eq(knowledgeArticlesTable.agentId, parsed.data.agentId)];
  if (parsed.data.status) filters.push(eq(knowledgeArticlesTable.status, parsed.data.status));
  if (parsed.data.targetId === "none") filters.push(isNull(knowledgeArticlesTable.targetId));
  else if (parsed.data.targetId) filters.push(eq(knowledgeArticlesTable.targetId, parsed.data.targetId));

  const rows = await db
    .select()
    .from(knowledgeArticlesTable)
    .where(and(...filters))
    .orderBy(knowledgeArticlesTable.title);
  res.json(rows.map(toArticle));
});

router.post("/articles", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = CreateArticleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res))) return;
  const targetId = await resolveTargetId(parsed.data.agentId, parsed.data.targetId ?? null, res);
  if (targetId === undefined) return;

  const sanitized = sanitizeArticleHtml(parsed.data.bodyHtml);
  const [row] = await db
    .insert(knowledgeArticlesTable)
    .values({
      userId: req.userId,
      agentId: parsed.data.agentId,
      targetId,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() ?? "",
      bodyHtml: sanitized.html,
      bodyText: sanitized.text,
      status: "draft",
    })
    .returning();
  res.status(201).json(toArticle(row));
});

router.patch("/articles/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = UpdateArticleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateArticleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await findArticle(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "Article not found" });
    return;
  }

  const updates: Partial<typeof knowledgeArticlesTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) {
    const title = parsed.data.title.trim();
    if (!title) {
      res.status(400).json({ error: "Title is required." });
      return;
    }
    updates.title = title;
  }
  const descriptionChanged =
    parsed.data.description !== undefined && parsed.data.description.trim() !== existing.description;
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description.trim();
  }
  if (parsed.data.targetId !== undefined) {
    const targetId = await resolveTargetId(existing.agentId, parsed.data.targetId, res);
    if (targetId === undefined) return;
    updates.targetId = targetId;
  }
  let sanitized = sanitizeArticleHtml(existing.bodyHtml);
  if (parsed.data.bodyHtml !== undefined) {
    sanitized = sanitizeArticleHtml(parsed.data.bodyHtml);
    updates.bodyHtml = sanitized.html;
    updates.bodyText = sanitized.text;
    if (existing.status === "published" && !articleHasContent(sanitized)) {
      res.status(400).json({ error: "A published article needs text or an image." });
      return;
    }
  }

  const [row] = await db
    .update(knowledgeArticlesTable)
    .set(updates)
    .where(eq(knowledgeArticlesTable.id, existing.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  if (parsed.data.bodyHtml !== undefined) {
    await removeUnreferencedArticleAssets(row.id, sanitized.assetIds);
  }
  if (row.status === "published" && (parsed.data.bodyHtml !== undefined || descriptionChanged)) {
    queueArticleIndex(row.id);
  }
  res.json(toArticle(row));
});

router.delete("/articles/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = DeleteArticleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const existing = await findArticle(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  await deleteKnowledgeAssetsForArticle(existing.id);
  await db.delete(knowledgeArticlesTable).where(eq(knowledgeArticlesTable.id, existing.id));
  res.sendStatus(204);
});

router.post("/articles/:id/publish", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = PublishArticleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const existing = await findArticle(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  const sanitized = sanitizeArticleHtml(existing.bodyHtml);
  if (!existing.title.trim() || !articleHasContent(sanitized)) {
    res.status(400).json({ error: "Add a title and some content before publishing." });
    return;
  }
  const [row] = await db
    .update(knowledgeArticlesTable)
    .set({
      status: "published",
      publishedAt: existing.publishedAt ?? new Date(),
      bodyHtml: sanitized.html,
      bodyText: sanitized.text,
      indexStatus: "idle",
      indexError: null,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeArticlesTable.id, existing.id))
    .returning();
  res.json(toArticle(row));
  queueArticleIndex(existing.id);
});

router.post("/articles/:id/archive", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = ArchiveArticleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await setLifecycle(params.data.id, "archived", res);
  if (!row) return;
  await deleteArticleChunks([row.id]);
  res.json(toArticle(row));
});

router.post("/articles/:id/draft", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = RestoreArticleDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await setLifecycle(params.data.id, "draft", res);
  if (!row) return;
  await deleteArticleChunks([row.id]);
  res.json(toArticle(row));
});

router.get("/articles/:id/assets", requireAuth, async (req, res): Promise<void> => {
  const params = ListArticleAssetsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const article = await findArticle(params.data.id);
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  res.json(await listKnowledgeAssets(article.id));
});

router.post("/articles/:id/assets", requireAuth, requireEditor, (req, res, next) => {
  imageUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Could not upload the image.";
      res.status(message.includes("File too large") ? 413 : 400).json({ error: message });
      return;
    }
    next();
  });
}, async (req, res): Promise<void> => {
  const articleId = z.string().uuid().safeParse(req.params.id);
  if (!articleId.success || !req.file?.buffer) {
    res.status(400).json({ error: "A valid image and article are required." });
    return;
  }
  const article = await findArticle(articleId.data);
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  let info;
  try {
    info = inspectKnowledgeImage(req.file.buffer, req.file.mimetype);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid image." });
    return;
  }
  try {
    const assets = await listKnowledgeAssets(article.id);
    const asset = await createKnowledgeAsset({
      articleId: article.id,
      agentId: article.agentId,
      buffer: req.file.buffer,
      mimeType: info.mimeType,
      originalName: req.file.originalname,
      position: assets.length,
      altText: typeof req.body?.altText === "string" ? req.body.altText.slice(0, 500) : "",
    });
    await db
      .update(knowledgeArticlesTable)
      .set({ imageCount: assets.length + (assets.some((item) => item.id === asset.id) ? 0 : 1), updatedAt: new Date() })
      .where(eq(knowledgeArticlesTable.id, article.id));
    res.status(201).json(asset);
  } catch (error) {
    const status = error instanceof KnowledgeAssetStorageError ? 503 : 400;
    res.status(status).json({ error: error instanceof Error ? error.message : "Could not store the image." });
  }
});

router.delete("/articles/assets/:assetId", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = DeleteArticleAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({ asset: knowledgeAssetsTable, article: knowledgeArticlesTable })
    .from(knowledgeAssetsTable)
    .innerJoin(knowledgeArticlesTable, eq(knowledgeAssetsTable.articleId, knowledgeArticlesTable.id))
    .where(eq(knowledgeAssetsTable.id, params.data.assetId))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  await deleteKnowledgeAssetById(params.data.assetId);
  const sanitized = sanitizeArticleHtml(
    row.article.bodyHtml.replaceAll(`data-asset-id="${params.data.assetId}"`, "data-asset-id=\"\""),
  );
  const remaining = await listKnowledgeAssets(row.article.id);
  await db
    .update(knowledgeArticlesTable)
    .set({
      bodyHtml: sanitized.html,
      bodyText: sanitized.text,
      imageCount: remaining.length,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeArticlesTable.id, row.article.id));
  if (row.article.status === "published") queueArticleIndex(row.article.id);
  res.sendStatus(204);
});

router.get("/articles/assets/:assetId/url", requireAuthOrDeployment, async (req, res): Promise<void> => {
  if (!knowledgeImagesEnabled()) {
    res.status(404).json({ error: "Article images are disabled." });
    return;
  }
  const params = GetArticleAssetUrlParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const result = await getAuthorizedKnowledgeAsset(params.data.assetId, req.userId, {
      workspace: Boolean(req.workspaceMemberId),
    });
    if (!result) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    res.json({ ...result.asset, url: result.url });
  } catch (error) {
    const status = error instanceof KnowledgeAssetStorageError ? 503 : 404;
    res.status(status).json({ error: error instanceof Error ? error.message : "Could not load the image." });
  }
});

async function requireAgent(
  userId: string,
  agentId: string | undefined,
  res: { status: (code: number) => { json: (body: unknown) => void } },
) {
  if (!agentId) return true;
  const agent = await getOwnedAgent(userId, agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return false;
  }
  return true;
}

async function findArticle(id: string) {
  const [article] = await db
    .select()
    .from(knowledgeArticlesTable)
    .where(eq(knowledgeArticlesTable.id, id))
    .limit(1);
  return article ?? null;
}

async function resolveTargetId(
  agentId: string,
  targetId: string | null,
  res: { status: (code: number) => { json: (body: unknown) => void } },
): Promise<string | null | undefined> {
  if (!targetId) return null;
  if (!z.string().uuid().safeParse(targetId).success) {
    res.status(400).json({ error: "Target not found for this agent." });
    return undefined;
  }
  const [target] = await db
    .select({ id: audienceTargetsTable.id, agentId: audienceTargetsTable.agentId })
    .from(audienceTargetsTable)
    .where(eq(audienceTargetsTable.id, targetId))
    .limit(1);
  if (!target || target.agentId !== agentId) {
    res.status(400).json({ error: "Target not found for this agent." });
    return undefined;
  }
  return target.id;
}

async function setLifecycle(
  id: string,
  status: "draft" | "archived",
  res: { status: (code: number) => { json: (body: unknown) => void } },
) {
  const existing = await findArticle(id);
  if (!existing) {
    res.status(404).json({ error: "Article not found" });
    return null;
  }
  const [row] = await db
    .update(knowledgeArticlesTable)
    .set({
      status,
      publishedAt: status === "draft" ? null : existing.publishedAt,
      indexStatus: "idle",
      indexError: null,
      chunkCount: 0,
      embeddingModel: null,
      lastIndexedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeArticlesTable.id, id))
    .returning();
  return row ?? null;
}

function toArticle(row: typeof knowledgeArticlesTable.$inferSelect) {
  return {
    id: row.id,
    agentId: row.agentId,
    title: row.title,
    description: row.description,
    bodyHtml: row.bodyHtml,
    status: row.status,
    targetId: row.targetId,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    indexStatus: row.indexStatus,
    indexError: row.indexError,
    chunkCount: row.chunkCount,
    imageCount: row.imageCount,
    imageFailedCount: row.imageFailedCount,
    lastIndexedAt: row.lastIndexedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export default router;
