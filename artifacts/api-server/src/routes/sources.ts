import { Router, type IRouter } from "express";
import { eq, and, or, isNull } from "drizzle-orm";
import multer from "multer";
import mammoth from "mammoth";
import { db, knowledgeSourcesTable, apiConnectorsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListSourcesQueryParams,
  CreateSourceBody,
  UpdateSourceParams,
  UpdateSourceBody,
  DeleteSourceParams,
  ListConnectorsQueryParams,
  CreateConnectorBody,
  UpdateConnectorParams,
  UpdateConnectorBody,
  DeleteConnectorParams,
} from "@workspace/api-zod";

import { getOwnedAgent } from "../lib/agents";
import { getSourceIntegration, listSourceIntegrations } from "../lib/replit-integrations";
import { indexSource } from "../lib/knowledge-indexing";
import { createEmbeddingProvider } from "../lib/llm";
import { logger } from "../lib/logger";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOCX_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCX_BYTES },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (file.mimetype === DOCX_MIME || name.endsWith(".docx")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only .docx files are supported"));
  },
});

const router: IRouter = Router();

const ownerOrSystem = (table: typeof knowledgeSourcesTable | typeof apiConnectorsTable, userId: string) =>
  or(eq(table.userId, userId), isNull(table.userId));

async function requireAgent(userId: string, agentId: string | undefined, res: { status: (n: number) => { json: (b: unknown) => void } }) {
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
    ? and(ownerOrSystem(knowledgeSourcesTable, req.userId), eq(knowledgeSourcesTable.agentId, parsed.data.agentId))
    : ownerOrSystem(knowledgeSourcesTable, req.userId);

  const rows = await db.select().from(knowledgeSourcesTable)
    .where(where)
    .orderBy(knowledgeSourcesTable.name);
  res.json(rows.map(toSource));
});

router.post("/sources", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.agentId) {
    if (!(await requireAgent(req.userId, parsed.data.agentId, res))) return;
  }

  let connectionConfig: Record<string, unknown> =
    (parsed.data.connectionConfig as Record<string, unknown> | undefined) ?? {};

  if (parsed.data.sourceType === "notion" || parsed.data.sourceType === "confluence") {
    const integration = await getSourceIntegration(parsed.data.sourceType);
    if (!integration?.connected) {
      res.status(400).json({
        error: `Connect ${parsed.data.sourceType === "notion" ? "Notion" : "Confluence"} in Replit Integrations first.`,
      });
      return;
    }
    connectionConfig = {
      ...connectionConfig,
      connectorName: integration.connectorName,
      connectionId: integration.connectionId,
    };
  }

  const [row] = await db
    .insert(knowledgeSourcesTable)
    .values({
      userId: req.userId,
      agentId: parsed.data.agentId ?? null,
      name: parsed.data.name,
      sourceType: parsed.data.sourceType,
      connectionConfig,
      isEnabled: parsed.data.isEnabled ?? true,
    })
    .returning();

  res.status(201).json(toSource(row));
  queueSourceIndex(row.id);
});

router.get("/sources/integrations", requireAuth, async (_req, res): Promise<void> => {
  const integrations = await listSourceIntegrations();
  res.json(integrations);
});

router.post("/sources/upload", requireAuth, (req, res, next) => {
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
    res.status(400).json({ error: "A .docx file is required." });
    return;
  }

  const agentId = typeof req.body?.agentId === "string" ? req.body.agentId : undefined;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!agentId) {
    res.status(400).json({ error: "agentId is required." });
    return;
  }
  if (!(await requireAgent(req.userId, agentId, res))) return;

  let text = "";
  try {
    const extracted = await mammoth.extractRawText({ buffer: file.buffer });
    text = extracted.value.trim();
  } catch {
    res.status(400).json({ error: "Could not read that Word document." });
    return;
  }

  const sourceName = name || file.originalname.replace(/\.docx$/i, "") || "Uploaded document";
  const [row] = await db
    .insert(knowledgeSourcesTable)
    .values({
      userId: req.userId,
      agentId,
      name: sourceName,
      sourceType: "document",
      connectionConfig: {
        fileName: file.originalname,
        mimeType: file.mimetype || DOCX_MIME,
        text,
      },
      isEnabled: true,
    })
    .returning();

  res.status(201).json(toSource(row));
  queueSourceIndex(row.id);
});

router.patch("/sources/:id", requireAuth, async (req, res): Promise<void> => {
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

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const d = parsed.data as Record<string, unknown>;
  if (d.name !== undefined) updates.name = d.name;
  if (d.sourceType !== undefined) updates.sourceType = d.sourceType;
  if (d.connectionConfig !== undefined) updates.connectionConfig = d.connectionConfig;
  if (d.isEnabled !== undefined) updates.isEnabled = d.isEnabled;

  const [row] = await db
    .update(knowledgeSourcesTable)
    .set(updates)
    .where(and(eq(knowledgeSourcesTable.id, params.data.id), eq(knowledgeSourcesTable.userId, req.userId)))
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

router.delete("/sources/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db
    .delete(knowledgeSourcesTable)
    .where(and(eq(knowledgeSourcesTable.id, params.data.id), eq(knowledgeSourcesTable.userId, req.userId)))
    .returning({ id: knowledgeSourcesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  res.sendStatus(204);
});

// ── API Connectors ────────────────────────────────────────────────────────
router.get("/connectors", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListConnectorsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res))) return;

  const where = parsed.data.agentId
    ? and(ownerOrSystem(apiConnectorsTable, req.userId), eq(apiConnectorsTable.agentId, parsed.data.agentId))
    : ownerOrSystem(apiConnectorsTable, req.userId);

  const rows = await db.select().from(apiConnectorsTable)
    .where(where)
    .orderBy(apiConnectorsTable.name);
  res.json(rows.map(toConnector));
});

router.post("/connectors", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateConnectorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.agentId) {
    if (!(await requireAgent(req.userId, parsed.data.agentId, res))) return;
  }

  const [row] = await db
    .insert(apiConnectorsTable)
    .values({
      userId: req.userId,
      agentId: parsed.data.agentId ?? null,
      name: parsed.data.name,
      endpointPattern: parsed.data.endpointPattern,
      authType: parsed.data.authType,
      authConfig: parsed.data.authConfig ?? {},
      isEnabled: parsed.data.isEnabled ?? true,
    })
    .returning();

  res.status(201).json(toConnector(row));
});

router.patch("/connectors/:id", requireAuth, async (req, res): Promise<void> => {
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
    .where(and(eq(apiConnectorsTable.id, params.data.id), eq(apiConnectorsTable.userId, req.userId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Connector not found" });
    return;
  }

  res.json(toConnector(row));
});

router.delete("/connectors/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteConnectorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db
    .delete(apiConnectorsTable)
    .where(and(eq(apiConnectorsTable.id, params.data.id), eq(apiConnectorsTable.userId, req.userId)))
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
