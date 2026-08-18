import { Router, type IRouter } from "express";
import { eq, and, or, isNull } from "drizzle-orm";
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

  const [row] = await db
    .insert(knowledgeSourcesTable)
    .values({
      userId: req.userId,
      agentId: parsed.data.agentId ?? null,
      name: parsed.data.name,
      sourceType: parsed.data.sourceType,
      connectionConfig: (parsed.data.connectionConfig as Record<string, unknown>) ?? {},
      isEnabled: parsed.data.isEnabled ?? true,
    })
    .returning();

  res.status(201).json(toSource(row));
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
    isEnabled: row.isEnabled,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export default router;
