import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, agentsTable, agentSettingsTable, agentDeploymentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateAgentBody,
  GetAgentParams,
  UpdateAgentParams,
  UpdateAgentBody,
  DeleteAgentParams,
} from "@workspace/api-zod";
import { ensureDefaultAgentIfNeeded, ensureEveryoneTarget, getOwnedAgent, toAgent } from "../lib/agents";
import { ensureDefaultTenant, getTenantContext } from "../lib/tenant";
import { hashDeploymentToken, newDeploymentToken } from "../lib/connection-secrets";

const router: IRouter = Router();

function requestTeamId(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  return typeof req.headers["x-team-id"] === "string" ? req.headers["x-team-id"] : undefined;
}

router.get("/agents", requireAuth, async (req, res): Promise<void> => {
  await ensureDefaultAgentIfNeeded(req.userId);
  const requestedTeamId = typeof req.query.teamId === "string"
    ? req.query.teamId
    : typeof req.headers["x-team-id"] === "string"
      ? req.headers["x-team-id"]
      : undefined;
  const tenant = requestedTeamId ? await getTenantContext(req.userId, requestedTeamId) : await ensureDefaultTenant(req.userId);
  if (!tenant) {
    res.status(403).json({ error: "You are not a member of this team." });
    return;
  }
  const rows = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.userId, req.userId), eq(agentsTable.teamId, tenant.teamId)))
    .orderBy(agentsTable.createdAt);
  res.json(rows.map(toAgent));
});

router.post("/agents", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const requestedTeamId = parsed.data.teamId ??
    (typeof req.headers["x-team-id"] === "string" ? req.headers["x-team-id"] : undefined);
  const tenant = requestedTeamId ? await getTenantContext(req.userId, requestedTeamId) : await ensureDefaultTenant(req.userId);
  if (!tenant) {
    res.status(403).json({ error: "You are not a member of this team." });
    return;
  }
  const [row] = await db
    .insert(agentsTable)
    .values({
      userId: req.userId,
      teamId: tenant.teamId,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? "",
      isEnabled: parsed.data.isEnabled ?? false,
    })
    .returning();

  await ensureEveryoneTarget(req.userId, row.id);
  res.status(201).json(toAgent(row));
});

router.get("/agents/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const agent = await getOwnedAgent(req.userId, params.data.id, requestTeamId(req));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  await ensureEveryoneTarget(req.userId, agent.id);
  res.json(toAgent(agent));
});

router.patch("/agents/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.isEnabled !== undefined) updates.isEnabled = parsed.data.isEnabled;

  const [row] = await db
    .update(agentsTable)
    .set(updates)
    .where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, req.userId), eq(agentsTable.teamId, requestTeamId(req) ?? "")))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.json(toAgent(row));
});

router.delete("/agents/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db
    .delete(agentsTable)
    .where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, req.userId), eq(agentsTable.teamId, requestTeamId(req) ?? "")))
    .returning({ id: agentsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/agents/:id/settings", requireAuth, async (req, res): Promise<void> => {
  const agent = await getOwnedAgent(req.userId, String(req.params.id), requestTeamId(req));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const [settings] = await db.select().from(agentSettingsTable)
    .where(eq(agentSettingsTable.agentId, agent.id)).limit(1);
  res.json(settings ?? {
    agentId: agent.id,
    prompt: "",
    targetAudience: "",
    llmProvider: "openai",
    llmModel: "",
    temperature: "0.2",
    configuration: {},
  });
});

router.post("/agents/:id/deployment-token", requireAuth, async (req, res): Promise<void> => {
  const agent = await getOwnedAgent(req.userId, String(req.params.id), requestTeamId(req));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const token = newDeploymentToken();
  const [deployment] = await db.insert(agentDeploymentsTable).values({
    agentId: agent.id,
    tokenHash: hashDeploymentToken(token),
    tokenPrefix: token.slice(0, 8),
  }).returning({ id: agentDeploymentsTable.id, tokenPrefix: agentDeploymentsTable.tokenPrefix, createdAt: agentDeploymentsTable.createdAt });
  res.status(201).json({ ...deployment, token });
});

router.patch("/agents/:id/settings", requireAuth, async (req, res): Promise<void> => {
  const agent = await getOwnedAgent(req.userId, String(req.params.id), requestTeamId(req));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const parsed = z.object({
    prompt: z.string().max(20000).optional(),
    targetAudience: z.string().max(2000).optional(),
    llmProvider: z.string().max(80).optional(),
    llmModel: z.string().max(160).optional(),
    temperature: z.string().max(20).optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [settings] = await db.insert(agentSettingsTable).values({
    agentId: agent.id,
    ...parsed.data,
  }).onConflictDoUpdate({
    target: agentSettingsTable.agentId,
    set: { ...parsed.data, updatedAt: new Date() },
  }).returning();
  res.json(settings);
});

export default router;
