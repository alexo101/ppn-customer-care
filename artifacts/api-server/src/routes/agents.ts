import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, agentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateAgentBody,
  GetAgentParams,
  UpdateAgentParams,
  UpdateAgentBody,
  DeleteAgentParams,
} from "@workspace/api-zod";
import { ensureDefaultAgentIfNeeded, getOwnedAgent, toAgent } from "../lib/agents";

const router: IRouter = Router();

router.get("/agents", requireAuth, async (req, res): Promise<void> => {
  await ensureDefaultAgentIfNeeded(req.userId);
  const rows = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.userId, req.userId))
    .orderBy(agentsTable.createdAt);
  res.json(rows.map(toAgent));
});

router.post("/agents", requireAuth, async (req, res): Promise<void> => {
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
    })
    .returning();

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

  const [row] = await db
    .update(agentsTable)
    .set(updates)
    .where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, req.userId)))
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
    .where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, req.userId)))
    .returning({ id: agentsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
