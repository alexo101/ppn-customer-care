import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, agentsTable, agentSettingsTable, agentDeploymentsTable } from "@workspace/db";
import { requireAuth, requireEditor } from "../middlewares/requireAuth";
import {
  CreateAgentBody,
  GetAgentParams,
  UpdateAgentParams,
  UpdateAgentBody,
  DeleteAgentParams,
  GetAgentQueryLiveDataParams,
  UpdateAgentQueryLiveDataParams,
  UpdateAgentQueryLiveDataBody,
} from "@workspace/api-zod";
import { ensureDefaultAgentIfNeeded, ensureEveryoneTarget, getOwnedAgent, toAgent } from "../lib/agents";
import { ensureAgentEscalationInbox, syncEscalationTeamNameWithAgent } from "../lib/escalations";
import { ensureAgentConversationSettings } from "../lib/conversation-settings";
import { hashDeploymentToken, newDeploymentToken } from "../lib/connection-secrets";
import {
  EMPTY_QUERY_LIVE_DATA_SETTINGS,
  readQueryLiveDataSettings,
  validateQueryLiveDataSettings,
} from "../lib/query-live-data";

const router: IRouter = Router();

router.get("/agents", requireAuth, async (req, res): Promise<void> => {
  await ensureDefaultAgentIfNeeded(req.userId);
  const rows = await db
    .select()
    .from(agentsTable)
    .orderBy(agentsTable.createdAt);
  res.json(rows.map(toAgent));
});

router.post("/agents", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = CreateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(agentsTable)
    .values({
      userId: req.userId,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? "",
      isEnabled: parsed.data.isEnabled ?? false,
      trustedDomains: parsed.data.trustedDomains ?? [],
    })
    .returning();

  await ensureEveryoneTarget(req.userId, row.id);
  await ensureAgentEscalationInbox(row.id);
  await ensureAgentConversationSettings(row.id);
  res.status(201).json(toAgent(row));
});

router.get("/agents/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const agent = await getOwnedAgent(req.userId, params.data.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  await ensureEveryoneTarget(req.userId, agent.id);
  res.json(toAgent(agent));
});

router.patch("/agents/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
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

  const agent = await getOwnedAgent(req.userId, params.data.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.isEnabled !== undefined) updates.isEnabled = parsed.data.isEnabled;
  if (parsed.data.trustedDomains !== undefined) updates.trustedDomains = parsed.data.trustedDomains;

  const [row] = await db
    .update(agentsTable)
    .set(updates)
    .where(eq(agentsTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  if (parsed.data.name !== undefined && row.name !== agent.name) {
    await syncEscalationTeamNameWithAgent(row.id, row.name, agent.name);
  }

  res.json(toAgent(row));
});

router.delete("/agents/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = DeleteAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db
    .delete(agentsTable)
    .where(eq(agentsTable.id, params.data.id))
    .returning({ id: agentsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/agents/:id/settings", requireAuth, async (req, res): Promise<void> => {
  const agent = await getOwnedAgent(req.userId, String(req.params.id));
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

router.post("/agents/:id/deployment-token", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const agent = await getOwnedAgent(req.userId, String(req.params.id));
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

router.patch("/agents/:id/settings", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const agent = await getOwnedAgent(req.userId, String(req.params.id));
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

router.get("/agents/:id/query-live-data", requireAuth, async (req, res): Promise<void> => {
  const params = GetAgentQueryLiveDataParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const agent = await getOwnedAgent(req.userId, params.data.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const [settings] = await db
    .select({ configuration: agentSettingsTable.configuration })
    .from(agentSettingsTable)
    .where(eq(agentSettingsTable.agentId, agent.id))
    .limit(1);
  const queryLiveData = readQueryLiveDataSettings(settings?.configuration);
  res.json({
    agentId: agent.id,
    method: "GET",
    ...queryLiveData,
    enabled: Boolean(queryLiveData.endpointUrl),
  });
});

router.patch(
  "/agents/:id/query-live-data",
  requireAuth,
  requireEditor,
  async (req, res): Promise<void> => {
    const params = UpdateAgentQueryLiveDataParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateAgentQueryLiveDataBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const agent = await getOwnedAgent(req.userId, params.data.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const settings = parsed.data.endpointUrl.trim()
      ? {
          endpointUrl: parsed.data.endpointUrl.trim(),
        }
      : { ...EMPTY_QUERY_LIVE_DATA_SETTINGS };
    const validationError = validateQueryLiveDataSettings(settings);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const [existing] = await db
      .select({ configuration: agentSettingsTable.configuration })
      .from(agentSettingsTable)
      .where(eq(agentSettingsTable.agentId, agent.id))
      .limit(1);
    const existingConfiguration =
      typeof existing?.configuration === "object" &&
      existing.configuration !== null &&
      !Array.isArray(existing.configuration)
        ? existing.configuration
        : {};
    const configuration = {
      ...existingConfiguration,
      queryLiveData: settings,
    };
    await db
      .insert(agentSettingsTable)
      .values({ agentId: agent.id, configuration })
      .onConflictDoUpdate({
        target: agentSettingsTable.agentId,
        set: { configuration, updatedAt: new Date() },
      });

    res.json({
      agentId: agent.id,
      method: "GET",
      ...settings,
      enabled: Boolean(settings.endpointUrl),
    });
  },
);

export default router;
