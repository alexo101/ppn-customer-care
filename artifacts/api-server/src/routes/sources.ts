import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import {
  db,
  knowledgeSourcesTable,
  apiConnectorsTable,
  agentSourceAssignmentsTable,
  agentConnectorAssignmentsTable,
  agentsTable,
} from "@workspace/db";
import { requireAuth, requireEditor } from "../middlewares/requireAuth";
import {
  ListSourcesQueryParams,
  CreateSourceBody,
  UpdateSourceParams,
  UpdateSourceBody,
  DeleteSourceParams,
  RefreshSourceParams,
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: OFFICE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedOfficeUpload(file)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only .docx and .xlsx files are supported"));
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
    res.status(400).json({ error: "A .docx or .xlsx file is required." });
    return;
  }

  const agentId = typeof req.body?.agentId === "string" ? req.body.agentId : undefined;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!agentId) {
    res.status(400).json({ error: "agentId is required." });
    return;
  }
  if (!(await requireAgent(req.userId, agentId, res))) return;

  let extracted: { kind: "document" | "spreadsheet"; text: string };
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

  const fallbackName = file.originalname.replace(/\.(docx|xlsx)$/i, "") || (
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

  res.status(201).json(toSource(row));
  await db.insert(agentSourceAssignmentsTable).values({ agentId, sourceId: row.id }).onConflictDoNothing();
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
      ? withIndexingState(sourceType, incoming)
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
    embeddingModel: null,
  };
}

function withIndexingState(
  sourceType: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (!isIndexableSourceType(sourceType)) return config;
  return { ...config, ...indexingState() };
}

function indexErrorResponse(error: unknown): { status: number; error: string } {
  if (error instanceof EmbeddingProviderError) {
    return { status: 503, error: error.message };
  }
  return {
    status: 502,
    error: error instanceof Error ? error.message : "Could not index this source.",
  };
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
