import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import multer from "multer";
import {
  db,
  knowledgeSourcesTable,
  apiConnectorsTable,
  agentSourceAssignmentsTable,
  agentConnectorAssignmentsTable,
  agentsTable,
  knowledgeAssetsTable,
} from "@workspace/db";
import {
  requireAuth,
  requireAuthOrDeployment,
  requireEditor,
} from "../middlewares/requireAuth";
import {
  ListSourcesQueryParams,
  CreateSourceBody,
  UpdateSourceParams,
  UpdateSourceBody,
  DeleteSourceParams,
  RefreshSourceParams,
  CreateSourceFromUrlBody,
  ListConnectorsQueryParams,
  CreateConnectorBody,
  UpdateConnectorParams,
  UpdateConnectorBody,
  DeleteConnectorParams,
} from "@workspace/api-zod";
import { z } from "zod";

import { getOwnedAgent } from "../lib/agents";
import {
  indexSource,
  isIndexableSourceType,
} from "../lib/knowledge-indexing";
import { createEmbeddingProvider, EmbeddingProviderError } from "../lib/llm";
import { logger } from "../lib/logger";
import {
  extractOfficeText,
  isAllowedOfficeUpload,
  OFFICE_MAX_BYTES,
} from "../lib/extract-office";
import {
  createKnowledgeAsset,
  deleteKnowledgeAssetById,
  deleteKnowledgeAssetsForSource,
  getAuthorizedKnowledgeAsset,
  listKnowledgeAssets,
} from "../lib/knowledge-assets";
import {
  KNOWLEDGE_IMAGE_MAX_BYTES,
  knowledgeImagesEnabled,
  inspectKnowledgeImage,
} from "../lib/knowledge-images";
import { KnowledgeAssetStorageError } from "../lib/knowledge-asset-storage";
import {
  fetchKnowledgeSourceFromUrl,
  GoogleSourceError,
} from "../lib/fetch-google-source";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: OFFICE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedOfficeUpload(file)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only .docx, .xlsx, and .pdf files are supported"));
  },
});

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
const uuid = z.string().uuid();

async function requireAgent(
  userId: string,
  agentId: string | undefined,
  res: { status: (n: number) => { json: (b: unknown) => void } },
) {
  if (!agentId) return true;
  const agent = await getOwnedAgent(userId, agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return false;
  }
  return true;
}

router.get("/sources", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListSourcesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res))) return;

  const where = parsed.data.agentId
    ? eq(knowledgeSourcesTable.agentId, parsed.data.agentId)
    : undefined;

  const rows = await db.select().from(knowledgeSourcesTable)
    .where(where)
    .orderBy(knowledgeSourcesTable.name);
  res.json(rows.map(toSource));
});

router.post("/sources", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = CreateSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!parsed.data.agentId) {
    res.status(400).json({ error: "agentId is required." });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res))) return;

  if (parsed.data.sourceType === "notion" || parsed.data.sourceType === "confluence") {
    res.status(400).json({ error: "Notion and Confluence sources are not supported." });
    return;
  }

  const connectionConfig: Record<string, unknown> =
    (parsed.data.connectionConfig as Record<string, unknown> | undefined) ?? {};

  const [row] = await db
    .insert(knowledgeSourcesTable)
    .values({
      userId: req.userId,
      agentId: parsed.data.agentId,
      name: parsed.data.name,
      sourceType: parsed.data.sourceType,
      connectionConfig: withIndexingState(parsed.data.sourceType, connectionConfig),
      isEnabled: parsed.data.isEnabled ?? true,
    })
    .returning();

  res.status(201).json(toSource(row));
  await db.insert(agentSourceAssignmentsTable).values({ agentId: parsed.data.agentId, sourceId: row.id }).onConflictDoNothing();
  queueSourceIndex(row.id);
});

router.post("/agents/:agentId/sources/:sourceId", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const agentId = uuid.safeParse(req.params.agentId);
  const sourceId = uuid.safeParse(req.params.sourceId);
  if (!agentId.success || !sourceId.success) {
    res.status(400).json({ error: "Invalid assignment" });
    return;
  }
  const [agent] = await db.select().from(agentsTable)
    .where(eq(agentsTable.id, agentId.data))
    .limit(1);
  const [source] = await db.select().from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, sourceId.data))
    .limit(1);
  if (!agent || !source) {
    res.status(404).json({ error: "Agent or source not found" });
    return;
  }
  const [assignment] = await db.insert(agentSourceAssignmentsTable)
    .values({ agentId: agent.id, sourceId: sourceId.data })
    .onConflictDoNothing()
    .returning();
  res.status(201).json(assignment ?? { agentId: agent.id, sourceId: sourceId.data });
});

router.post("/sources/:id/refresh", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = RefreshSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  if (!isIndexableSourceType(existing.sourceType)) {
    res.status(400).json({ error: "This source type cannot be indexed." });
    return;
  }

  try {
    await indexSource(existing.id, createEmbeddingProvider());
  } catch (error) {
    const mapped = indexErrorResponse(error);
    res.status(mapped.status).json({ error: mapped.error });
    return;
  }

  const [updated] = await db
    .select()
    .from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, existing.id))
    .limit(1);
  res.json(toSource(updated ?? existing));
});

router.post("/sources/upload", requireAuth, requireEditor, (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Could not upload the document.";
      const status = message.includes("File too large") ? 413 : 400;
      res.status(status).json({ error: message });
      return;
    }
    next();
  });
}, async (req, res): Promise<void> => {
  const file = req.file;
  if (!file?.buffer) {
    res.status(400).json({ error: "A .docx, .xlsx, or .pdf file is required." });
    return;
  }

  const agentId = typeof req.body?.agentId === "string" ? req.body.agentId : undefined;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!agentId) {
    res.status(400).json({ error: "agentId is required." });
    return;
  }
  if (!(await requireAgent(req.userId, agentId, res))) return;

  let extracted: {
    kind: "document" | "spreadsheet";
    text: string;
    images: Array<{
      buffer: Buffer;
      mimeType: "image/png" | "image/jpeg" | "image/webp";
      originalName: string;
      position: number;
    }>;
  };
  try {
    extracted = await extractOfficeText({
      originalname: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
    });
  } catch {
    res.status(400).json({ error: "Could not read that file." });
    return;
  }

  const fallbackName = file.originalname.replace(/\.(docx|xlsx|pdf)$/i, "") || (
    extracted.kind === "spreadsheet" ? "Uploaded spreadsheet" : "Uploaded document"
  );
  const sourceName = name || fallbackName;
  const [row] = await db
    .insert(knowledgeSourcesTable)
    .values({
      userId: req.userId,
      agentId,
      name: sourceName,
      sourceType: extracted.kind,
      connectionConfig: withIndexingState(extracted.kind, {
        fileName: file.originalname,
        mimeType: file.mimetype,
        text: extracted.text,
      }),
      isEnabled: true,
    })
    .returning();

  try {
    const assetIds = [];
    for (const image of extracted.images) {
      const asset = await createKnowledgeAsset({
        sourceId: row.id,
        agentId,
        buffer: image.buffer,
        mimeType: image.mimeType,
        originalName: image.originalName,
        position: image.position,
      });
      assetIds.push(asset.id);
    }
    if (assetIds.length > 0) {
      const config = (row.connectionConfig ?? {}) as Record<string, unknown>;
      const [updated] = await db
        .update(knowledgeSourcesTable)
        .set({
          connectionConfig: {
            ...config,
            assetIds,
            imageCount: assetIds.length,
          },
          updatedAt: new Date(),
        })
        .where(eq(knowledgeSourcesTable.id, row.id))
        .returning();
      if (updated) row.connectionConfig = updated.connectionConfig;
    }
  } catch (error) {
    logger.warn({ sourceId: row.id, error }, "Could not persist document images");
  }

  res.status(201).json(toSource(row));
  await db.insert(agentSourceAssignmentsTable).values({ agentId, sourceId: row.id }).onConflictDoNothing();
  queueSourceIndex(row.id);
});

router.get("/sources/:id/assets", requireAuth, async (req, res): Promise<void> => {
  const sourceId = uuid.safeParse(req.params.id);
  if (!sourceId.success) {
    res.status(400).json({ error: "Invalid source." });
    return;
  }
  const [source] = await db
    .select({ id: knowledgeSourcesTable.id })
    .from(knowledgeSourcesTable)
    .where(and(eq(knowledgeSourcesTable.id, sourceId.data), eq(knowledgeSourcesTable.userId, req.userId)))
    .limit(1);
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  res.json(await listKnowledgeAssets(source.id));
});

router.post("/sources/:id/assets", requireAuth, requireEditor, (req, res, next) => {
  imageUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Could not upload the image.";
      res.status(message.includes("File too large") ? 413 : 400).json({ error: message });
      return;
    }
    next();
  });
}, async (req, res): Promise<void> => {
  const sourceId = uuid.safeParse(req.params.id);
  if (!sourceId.success || !req.file?.buffer) {
    res.status(400).json({ error: "A valid image and source are required." });
    return;
  }
  const [source] = await db
    .select()
    .from(knowledgeSourcesTable)
    .where(and(eq(knowledgeSourcesTable.id, sourceId.data), eq(knowledgeSourcesTable.userId, req.userId)))
    .limit(1);
  if (!source || !source.agentId) {
    res.status(404).json({ error: "Source not found" });
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
    const assets = await listKnowledgeAssets(source.id);
    const asset = await createKnowledgeAsset({
      sourceId: source.id,
      agentId: source.agentId,
      buffer: req.file.buffer,
      mimeType: info.mimeType,
      originalName: req.file.originalname,
      position: assets.length,
      altText: typeof req.body?.altText === "string" ? req.body.altText.slice(0, 500) : "",
    });
    const nextAssets = [...assets.filter((item) => item.id !== asset.id), asset]
      .sort((left, right) => left.position - right.position);
    await db
      .update(knowledgeSourcesTable)
      .set({
        connectionConfig: {
          ...((source.connectionConfig ?? {}) as Record<string, unknown>),
          assetIds: nextAssets.map((item) => item.id),
          imageCount: nextAssets.length,
        },
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSourcesTable.id, source.id));
    queueSourceIndex(source.id);
    res.status(201).json(asset);
  } catch (error) {
    const status = error instanceof KnowledgeAssetStorageError ? 503 : 400;
    res.status(status).json({ error: error instanceof Error ? error.message : "Could not store the image." });
  }
});

router.delete("/sources/assets/:assetId", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const assetId = uuid.safeParse(req.params.assetId);
  if (!assetId.success) {
    res.status(400).json({ error: "Invalid asset." });
    return;
  }
  const [row] = await db
    .select({ asset: knowledgeAssetsTable, source: knowledgeSourcesTable })
    .from(knowledgeAssetsTable)
    .innerJoin(knowledgeSourcesTable, eq(knowledgeAssetsTable.sourceId, knowledgeSourcesTable.id))
    .where(and(eq(knowledgeAssetsTable.id, assetId.data), eq(knowledgeSourcesTable.userId, req.userId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  await deleteKnowledgeAssetById(assetId.data);
  const remaining = await listKnowledgeAssets(row.source.id);
  await db.update(knowledgeSourcesTable)
    .set({
      connectionConfig: {
        ...((row.source.connectionConfig ?? {}) as Record<string, unknown>),
        assetIds: remaining.map((asset) => asset.id),
        imageCount: remaining.length,
      },
      updatedAt: new Date(),
    })
    .where(eq(knowledgeSourcesTable.id, row.source.id));
  queueSourceIndex(row.source.id);
  res.sendStatus(204);
});

router.get("/sources/assets/:assetId/url", requireAuthOrDeployment, async (req, res): Promise<void> => {
  if (!knowledgeImagesEnabled()) {
    res.status(404).json({ error: "Screenshot knowledge is disabled." });
    return;
  }
  const assetId = uuid.safeParse(req.params.assetId);
  if (!assetId.success) {
    res.status(400).json({ error: "Invalid asset." });
    return;
  }
  try {
    const result = await getAuthorizedKnowledgeAsset(assetId.data, req.userId);
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

router.post("/sources/from-url", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = CreateSourceFromUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res))) return;

  let fetched;
  try {
    fetched = await fetchKnowledgeSourceFromUrl(parsed.data.url);
  } catch (error) {
    if (error instanceof GoogleSourceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not import that link.",
    });
    return;
  }

  const sourceName = parsed.data.name?.trim() || fetched.title;
  const [row] = await db
    .insert(knowledgeSourcesTable)
    .values({
      userId: req.userId,
      agentId: parsed.data.agentId,
      name: sourceName,
      sourceType: fetched.kind,
      connectionConfig: withIndexingState(fetched.kind, {
        url: fetched.url,
        fileName: fetched.title,
        mimeType: fetched.mimeType,
        text: fetched.text,
      }),
      isEnabled: true,
    })
    .returning();

  try {
    await attachFetchedImages(row.id, parsed.data.agentId, fetched.images);
  } catch (error) {
    logger.warn({ sourceId: row.id, error }, "Could not persist imported images");
  }
  const [withImages] = await db
    .select()
    .from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, row.id))
    .limit(1);
  res.status(201).json(toSource(withImages ?? row));
  await db
    .insert(agentSourceAssignmentsTable)
    .values({ agentId: parsed.data.agentId, sourceId: row.id })
    .onConflictDoNothing();
  queueSourceIndex(row.id);
});

router.patch("/sources/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = UpdateSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const d = parsed.data as Record<string, unknown>;
  if (d.name !== undefined) updates.name = d.name;
  if (d.sourceType !== undefined) updates.sourceType = d.sourceType;
  if (d.isEnabled !== undefined) updates.isEnabled = d.isEnabled;
  if (d.connectionConfig !== undefined) {
    const incoming = (d.connectionConfig as Record<string, unknown>) ?? {};
    const sourceType = typeof d.sourceType === "string" ? d.sourceType : existing.sourceType;
    if (sourceType === "notion" || sourceType === "confluence") {
      res.status(400).json({ error: "Notion and Confluence sources are not supported." });
      return;
    }
    updates.connectionConfig = isIndexableSourceType(sourceType)
      ? withIndexingState(sourceType, {
          ...((existing.connectionConfig ?? {}) as Record<string, unknown>),
          ...incoming,
        })
      : incoming;
  }

  const [row] = await db
    .update(knowledgeSourcesTable)
    .set(updates)
    .where(eq(knowledgeSourcesTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  res.json(toSource(row));
  if (d.sourceType !== undefined || d.connectionConfig !== undefined) {
    queueSourceIndex(row.id);
  }
});

router.delete("/sources/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = DeleteSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: knowledgeSourcesTable.id })
    .from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  await deleteKnowledgeAssetsForSource(params.data.id);
  const deleted = await db
    .delete(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, params.data.id))
    .returning({ id: knowledgeSourcesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/connectors", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListConnectorsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res))) return;

  const where = parsed.data.agentId
    ? eq(apiConnectorsTable.agentId, parsed.data.agentId)
    : undefined;

  const rows = await db.select().from(apiConnectorsTable)
    .where(where)
    .orderBy(apiConnectorsTable.name);
  res.json(rows.map(toConnector));
});

router.post("/connectors", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = CreateConnectorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!parsed.data.agentId) {
    res.status(400).json({ error: "agentId is required." });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res))) return;

  const [row] = await db
    .insert(apiConnectorsTable)
    .values({
      userId: req.userId,
      agentId: parsed.data.agentId,
      name: parsed.data.name,
      endpointPattern: parsed.data.endpointPattern,
      authType: parsed.data.authType,
      authConfig: parsed.data.authConfig ?? {},
      isEnabled: parsed.data.isEnabled ?? true,
    })
    .returning();

  res.status(201).json(toConnector(row));
  await db.insert(agentConnectorAssignmentsTable).values({ agentId: parsed.data.agentId, connectorId: row.id }).onConflictDoNothing();
});

router.patch("/connectors/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = UpdateConnectorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateConnectorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const d = parsed.data as Record<string, unknown>;
  if (d.name !== undefined) updates.name = d.name;
  if (d.endpointPattern !== undefined) updates.endpointPattern = d.endpointPattern;
  if (d.authType !== undefined) updates.authType = d.authType;
  if (d.authConfig !== undefined) updates.authConfig = d.authConfig;
  if (d.isEnabled !== undefined) updates.isEnabled = d.isEnabled;

  const [row] = await db
    .update(apiConnectorsTable)
    .set(updates)
    .where(eq(apiConnectorsTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Connector not found" });
    return;
  }

  res.json(toConnector(row));
});

router.delete("/connectors/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = DeleteConnectorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db
    .delete(apiConnectorsTable)
    .where(eq(apiConnectorsTable.id, params.data.id))
    .returning({ id: apiConnectorsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Connector not found" });
    return;
  }

  res.sendStatus(204);
});

function toSource(row: typeof knowledgeSourcesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.sourceType,
    connectionConfig: (row.connectionConfig as Record<string, unknown>) ?? {},
    isEnabled: row.isEnabled,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toConnector(row: typeof apiConnectorsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    endpointPattern: row.endpointPattern,
    authType: row.authType,
    authConfig: (row.authConfig as Record<string, unknown>) ?? {},
    isEnabled: row.isEnabled,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function indexingState(): Record<string, unknown> {
  return {
    syncStatus: "idle",
    lastSyncedAt: null,
    lastError: null,
    itemCount: 0,
    chunkCount: 0,
    imageCount: 0,
    imageFailedCount: 0,
    embeddingModel: null,
  };
}

function withIndexingState(
  sourceType: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (!isIndexableSourceType(sourceType)) return config;
  const state = indexingState();
  return {
    ...config,
    ...state,
    ...(Array.isArray(config.assetIds)
      ? {
          assetIds: config.assetIds,
          imageCount: typeof config.imageCount === "number" ? config.imageCount : 0,
          imageFailedCount:
            typeof config.imageFailedCount === "number" ? config.imageFailedCount : 0,
        }
      : {}),
  };
}

function indexErrorResponse(error: unknown): { status: number; error: string } {
  if (error instanceof GoogleSourceError) {
    return { status: error.statusCode, error: error.message };
  }
  if (error instanceof EmbeddingProviderError) {
    return { status: 503, error: error.message };
  }
  return {
    status: 502,
    error: error instanceof Error ? error.message : "Could not index this source.",
  };
}

async function attachFetchedImages(
  sourceId: string,
  agentId: string,
  images: Array<{
    buffer: Buffer;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    originalName: string;
    position: number;
  }>,
): Promise<void> {
  if (images.length === 0) return;
  const assetIds: string[] = [];
  for (const image of images.slice(0, 40)) {
    const asset = await createKnowledgeAsset({
      sourceId,
      agentId,
      buffer: image.buffer,
      mimeType: image.mimeType,
      originalName: image.originalName,
      position: image.position,
    });
    assetIds.push(asset.id);
  }
  const [source] = await db
    .select()
    .from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, sourceId))
    .limit(1);
  if (!source) return;
  await db
    .update(knowledgeSourcesTable)
    .set({
      connectionConfig: {
        ...((source.connectionConfig ?? {}) as Record<string, unknown>),
        assetIds,
        imageCount: assetIds.length,
      },
      updatedAt: new Date(),
    })
    .where(eq(knowledgeSourcesTable.id, sourceId));
}

function queueSourceIndex(sourceId: string): void {
  void (async () => {
    try {
      await indexSource(sourceId, createEmbeddingProvider());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ sourceId, error: message }, "Could not index knowledge source");
    }
  })();
}

export default router;
