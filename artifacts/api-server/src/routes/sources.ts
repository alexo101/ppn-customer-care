import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import multer from "multer";
import mammoth from "mammoth";
import {
  db,
  knowledgeSourcesTable,
  apiConnectorsTable,
  teamSourceGrantsTable,
  teamConnectorGrantsTable,
  agentSourceAssignmentsTable,
  agentConnectorAssignmentsTable,
  organizationConnectionsTable,
  teamConnectionsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListSourcesQueryParams,
  CreateSourceBody,
  UpdateSourceParams,
  UpdateSourceBody,
  DeleteSourceParams,
  BrowseSourceIntegrationQueryParams,
  RefreshSourceParams,
  ListConnectorsQueryParams,
  CreateConnectorBody,
  UpdateConnectorParams,
  UpdateConnectorBody,
  DeleteConnectorParams,
} from "@workspace/api-zod";

import { getOwnedAgent } from "../lib/agents";
import {
  getSourceIntegration,
  IntegrationProviderError,
  isSourceIntegrationName,
  listSourceIntegrations,
} from "../lib/replit-integrations";
import {
  browseIntegrationContent,
  indexSource,
  isIndexableSourceType,
} from "../lib/knowledge-indexing";
import { parseSelectedKnowledgeItems } from "../lib/integration-knowledge";
import { createEmbeddingProvider, EmbeddingProviderError } from "../lib/llm";
import { logger } from "../lib/logger";
import { ensureDefaultTenant, getTenantContext } from "../lib/tenant";
import { createManagedIntegrationProxy } from "../lib/managed-integrations";

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
  eq(table.userId, userId);

async function requireAgent(userId: string, agentId: string | undefined, res: { status: (n: number) => { json: (b: unknown) => void } }, teamId?: string) {
  if (!agentId) return true;
  const agent = await getOwnedAgent(userId, agentId, teamId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return false;
  }
  return true;
}

async function tenantForAgent(userId: string, agentId: string, teamId?: string) {
  const agent = await getOwnedAgent(userId, agentId, teamId);
  if (!agent) return null;
  const tenant = teamId
    ? await getTenantContext(userId, teamId)
    : await ensureDefaultTenant(userId);
  if (!tenant || (agent.teamId && agent.teamId !== tenant.teamId)) return null;
  return tenant;
}

function activeTeamId(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  return typeof req.headers["x-team-id"] === "string" ? req.headers["x-team-id"] : undefined;
}

router.get("/sources", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListSourcesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res, activeTeamId(req)))) return;

  const where = parsed.data.agentId
    ? and(ownerOrSystem(knowledgeSourcesTable, req.userId), eq(knowledgeSourcesTable.agentId, parsed.data.agentId), eq(knowledgeSourcesTable.teamId, activeTeamId(req) ?? ""))
    : and(ownerOrSystem(knowledgeSourcesTable, req.userId), eq(knowledgeSourcesTable.teamId, activeTeamId(req) ?? ""));

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

  if (!parsed.data.agentId) {
    res.status(400).json({ error: "agentId is required." });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res, activeTeamId(req)))) return;
  const tenant = await tenantForAgent(req.userId, parsed.data.agentId, activeTeamId(req));
  if (!tenant) {
    res.status(403).json({ error: "Invalid team context." });
    return;
  }

  let connectionConfig: Record<string, unknown> =
    (parsed.data.connectionConfig as Record<string, unknown> | undefined) ?? {};

  if (parsed.data.sourceType === "notion" || parsed.data.sourceType === "confluence") {
    const integrationConfig = await integrationConnectionConfig(
      parsed.data.sourceType,
      connectionConfig,
      tenant,
    );
    if ("error" in integrationConfig) {
      res.status(400).json({ error: integrationConfig.error });
      return;
    }
    connectionConfig = integrationConfig.config;
  }

  const [row] = await db
    .insert(knowledgeSourcesTable)
    .values({
      userId: req.userId,
      organizationId: tenant.organizationId,
      teamId: tenant.teamId,
      agentId: parsed.data.agentId,
      name: parsed.data.name,
      sourceType: parsed.data.sourceType,
      connectionConfig: withIndexingState(parsed.data.sourceType, connectionConfig),
      isEnabled: parsed.data.isEnabled ?? true,
    })
    .returning();

  res.status(201).json(toSource(row));
  await db.insert(teamSourceGrantsTable).values({ teamId: tenant.teamId, sourceId: row.id }).onConflictDoNothing();
  await db.insert(agentSourceAssignmentsTable).values({ agentId: parsed.data.agentId, sourceId: row.id }).onConflictDoNothing();
  queueSourceIndex(row.id, { organizationId: tenant.organizationId, teamId: tenant.teamId });
});

router.get("/sources/integrations", requireAuth, async (_req, res): Promise<void> => {
  const integrations = await listSourceIntegrations();
  res.json(integrations);
});

router.get("/sources/integrations/browse", requireAuth, async (req, res): Promise<void> => {
  const parsed = BrowseSourceIntegrationQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isSourceIntegrationName(parsed.data.connectorName)) {
    res.status(400).json({ error: "Unsupported integration." });
    return;
  }

  if (parsed.data.organizationConnectionId) {
    const teamId = parsed.data.teamId;
    const tenant = teamId ? await getTenantContext(req.userId, teamId) : await ensureDefaultTenant(req.userId);
    if (!tenant) {
      res.status(403).json({ error: "Invalid team context." });
      return;
    }
    try {
      const proxy = await createManagedIntegrationProxy(
        parsed.data.organizationConnectionId,
        tenant.organizationId,
        tenant.teamId,
      );
      const result = await browseIntegrationContent(parsed.data.connectorName, {
        query: parsed.data.query,
        cursor: parsed.data.cursor,
        spaceId: parsed.data.spaceId,
      }, proxy);
      res.json(result);
    } catch (error) {
      const mapped = integrationErrorResponse(error);
      res.status(mapped.status).json({ error: mapped.error });
    }
    return;
  }

  const integration = await getSourceIntegration(parsed.data.connectorName);
  if (!integration?.connected) {
    res.status(403).json({
      error: `Connect ${integration?.displayName ?? parsed.data.connectorName} in Replit Integrations first.`,
    });
    return;
  }

  try {
    const result = await browseIntegrationContent(parsed.data.connectorName, {
      query: parsed.data.query,
      cursor: parsed.data.cursor,
      spaceId: parsed.data.spaceId,
    });
    res.json(result);
  } catch (error) {
    const mapped = integrationErrorResponse(error);
    res.status(mapped.status).json({ error: mapped.error });
  }
});

router.post("/sources/:id/refresh", requireAuth, async (req, res): Promise<void> => {
  const params = RefreshSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(knowledgeSourcesTable)
    .where(and(eq(knowledgeSourcesTable.id, params.data.id), eq(knowledgeSourcesTable.userId, req.userId), eq(knowledgeSourcesTable.teamId, activeTeamId(req) ?? "")))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  if (!isIndexableSourceType(existing.sourceType)) {
    res.status(400).json({ error: "This source type cannot be indexed." });
    return;
  }

  if (existing.sourceType === "notion" || existing.sourceType === "confluence") {
    const integration = await getSourceIntegration(existing.sourceType);
    if (!integration?.connected) {
      res.status(403).json({
        error: `Connect ${existing.sourceType === "notion" ? "Notion" : "Confluence"} in Replit Integrations first.`,
      });
      return;
    }
  }

  try {
    await indexSource(existing.id, createEmbeddingProvider(), {
      organizationId: existing.organizationId ?? undefined,
      teamId: existing.teamId ?? undefined,
    });
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
  if (!(await requireAgent(req.userId, agentId, res, activeTeamId(req)))) return;
  const tenant = await tenantForAgent(req.userId, agentId, activeTeamId(req));
  if (!tenant) {
    res.status(403).json({ error: "Invalid team context." });
    return;
  }

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
      organizationId: tenant.organizationId,
      teamId: tenant.teamId,
      agentId,
      name: sourceName,
      sourceType: "document",
      connectionConfig: withIndexingState("document", {
        fileName: file.originalname,
        mimeType: file.mimetype || DOCX_MIME,
        text,
      }),
      isEnabled: true,
    })
    .returning();

  res.status(201).json(toSource(row));
  await db.insert(teamSourceGrantsTable).values({ teamId: tenant.teamId, sourceId: row.id }).onConflictDoNothing();
  await db.insert(agentSourceAssignmentsTable).values({ agentId, sourceId: row.id }).onConflictDoNothing();
  queueSourceIndex(row.id, { organizationId: tenant.organizationId, teamId: tenant.teamId });
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

  const [existing] = await db
    .select()
    .from(knowledgeSourcesTable)
    .where(and(eq(knowledgeSourcesTable.id, params.data.id), eq(knowledgeSourcesTable.userId, req.userId), eq(knowledgeSourcesTable.teamId, activeTeamId(req) ?? "")))
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
      const integrationConfig = await integrationConnectionConfig(sourceType, incoming, {
        organizationId: existing.organizationId ?? undefined,
        teamId: existing.teamId ?? undefined,
      });
      if ("error" in integrationConfig) {
        res.status(400).json({ error: integrationConfig.error });
        return;
      }
      updates.connectionConfig = integrationConfig.config;
    } else if (isIndexableSourceType(sourceType)) {
      updates.connectionConfig = withIndexingState(sourceType, incoming);
    } else {
      updates.connectionConfig = incoming;
    }
  }

  const [row] = await db
    .update(knowledgeSourcesTable)
    .set(updates)
    .where(and(eq(knowledgeSourcesTable.id, params.data.id), eq(knowledgeSourcesTable.userId, req.userId), eq(knowledgeSourcesTable.teamId, activeTeamId(req) ?? "")))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  res.json(toSource(row));
  if (d.sourceType !== undefined || d.connectionConfig !== undefined) {
    queueSourceIndex(row.id, {
      organizationId: row.organizationId ?? undefined,
      teamId: row.teamId ?? undefined,
    });
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
    .where(and(eq(knowledgeSourcesTable.id, params.data.id), eq(knowledgeSourcesTable.userId, req.userId), eq(knowledgeSourcesTable.teamId, activeTeamId(req) ?? "")))
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
  if (!(await requireAgent(req.userId, parsed.data.agentId, res, activeTeamId(req)))) return;

  const where = parsed.data.agentId
    ? and(ownerOrSystem(apiConnectorsTable, req.userId), eq(apiConnectorsTable.agentId, parsed.data.agentId), eq(apiConnectorsTable.teamId, activeTeamId(req) ?? ""))
    : and(ownerOrSystem(apiConnectorsTable, req.userId), eq(apiConnectorsTable.teamId, activeTeamId(req) ?? ""));

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

  if (!parsed.data.agentId) {
    res.status(400).json({ error: "agentId is required." });
    return;
  }
  if (!(await requireAgent(req.userId, parsed.data.agentId, res, activeTeamId(req)))) return;
  const tenant = await tenantForAgent(req.userId, parsed.data.agentId, activeTeamId(req));
  if (!tenant) {
    res.status(403).json({ error: "Invalid team context." });
    return;
  }

  const [row] = await db
    .insert(apiConnectorsTable)
    .values({
      userId: req.userId,
      organizationId: tenant.organizationId,
      teamId: tenant.teamId,
      agentId: parsed.data.agentId,
      name: parsed.data.name,
      endpointPattern: parsed.data.endpointPattern,
      authType: parsed.data.authType,
      connectionId: parsed.data.connectionId ?? null,
      authConfig: parsed.data.authConfig ?? {},
      isEnabled: parsed.data.isEnabled ?? true,
    })
    .returning();

  res.status(201).json(toConnector(row));
  await db.insert(teamConnectorGrantsTable).values({ teamId: tenant.teamId, connectorId: row.id }).onConflictDoNothing();
  await db.insert(agentConnectorAssignmentsTable).values({ agentId: parsed.data.agentId, connectorId: row.id }).onConflictDoNothing();
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
  if (d.connectionId !== undefined) updates.connectionId = d.connectionId;
  if (d.authConfig !== undefined) updates.authConfig = d.authConfig;
  if (d.isEnabled !== undefined) updates.isEnabled = d.isEnabled;

  const [row] = await db
    .update(apiConnectorsTable)
    .set(updates)
    .where(and(eq(apiConnectorsTable.id, params.data.id), eq(apiConnectorsTable.userId, req.userId), eq(apiConnectorsTable.teamId, activeTeamId(req) ?? "")))
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
    .where(and(eq(apiConnectorsTable.id, params.data.id), eq(apiConnectorsTable.userId, req.userId), eq(apiConnectorsTable.teamId, activeTeamId(req) ?? "")))
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
    connectionId: row.connectionId ?? null,
    authConfig: (row.authConfig as Record<string, unknown>) ?? {},
    isEnabled: row.isEnabled,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

async function integrationConnectionConfig(
  sourceType: "notion" | "confluence",
  incoming: Record<string, unknown>,
  tenant?: { organizationId?: string; teamId?: string },
): Promise<{ config: Record<string, unknown> } | { error: string }> {
  const managedConnectionId = typeof incoming.organizationConnectionId === "string"
    ? incoming.organizationConnectionId
    : null;
  if (managedConnectionId && tenant?.organizationId && tenant.teamId) {
    const [managed] = await db
      .select({ connection: organizationConnectionsTable })
      .from(organizationConnectionsTable)
      .innerJoin(
        teamConnectionsTable,
        and(
          eq(teamConnectionsTable.connectionId, organizationConnectionsTable.id),
          eq(teamConnectionsTable.teamId, tenant.teamId),
          eq(teamConnectionsTable.enabled, true),
        ),
      )
      .where(and(
        eq(organizationConnectionsTable.id, managedConnectionId),
        eq(organizationConnectionsTable.organizationId, tenant.organizationId),
        eq(organizationConnectionsTable.provider, sourceType),
        eq(organizationConnectionsTable.status, "connected"),
      ))
      .limit(1);
    if (!managed) return { error: "Connection is not enabled for this team." };
    const selectedItems = parseSelectedKnowledgeItems(incoming.selectedItems);
    if (selectedItems.length === 0) return { error: "Select at least one page, database, or space." };
    return {
      config: {
        organizationConnectionId: managedConnectionId,
        selectedItems,
        ...indexingState(),
      },
    };
  }
  const integration = await getSourceIntegration(sourceType);
  if (!integration?.connected) {
    return {
      error: `Connect ${sourceType === "notion" ? "Notion" : "Confluence"} in Replit Integrations first.`,
    };
  }
  const selectedItems = parseSelectedKnowledgeItems(incoming.selectedItems);
  if (selectedItems.length === 0) {
    return { error: "Select at least one page, database, or space." };
  }
  return {
    config: {
      connectorName: integration.connectorName,
      connectionId: integration.connectionId,
      selectedItems,
      ...indexingState(),
    },
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
  const mapped = integrationErrorResponse(error);
  return {
    status: mapped.status === 403 ? 403 : 502,
    error: mapped.error,
  };
}

function integrationErrorResponse(error: unknown): { status: number; error: string } {
  if (error instanceof IntegrationProviderError) {
    const status =
      error.code === "disconnected" || error.code === "permission"
        ? 403
        : error.code === "not_found"
          ? 404
          : error.code === "rate_limit"
            ? 429
            : 502;
    return { status, error: error.message };
  }
  return {
    status: 502,
    error: error instanceof Error ? error.message : "Could not reach the connected provider.",
  };
}

function queueSourceIndex(sourceId: string, scope?: { organizationId?: string; teamId?: string }): void {
  void (async () => {
    try {
      await indexSource(sourceId, createEmbeddingProvider(), scope);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ sourceId, error: message }, "Could not index knowledge source");
    }
  })();
}

export default router;
