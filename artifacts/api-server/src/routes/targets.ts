import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, audienceTargetsTable, targetConditionsTable } from "@workspace/db";
import { requireAuth, requireEditor } from "../middlewares/requireAuth";
import {
  ListTargetsQueryParams,
  CreateTargetBody,
  UpdateTargetParams,
  UpdateTargetBody,
  DeleteTargetParams,
} from "@workspace/api-zod";
import { getOwnedAgent, ensureEveryoneTarget } from "../lib/agents";
import {
  isMatchMode,
  validateTargetCondition,
  type TargetConditionDraft,
} from "../lib/targets";

const router: IRouter = Router();

type TargetRow = typeof audienceTargetsTable.$inferSelect;
type ConditionRow = typeof targetConditionsTable.$inferSelect;

function toCondition(row: ConditionRow) {
  return {
    id: row.id,
    personType: row.personType as TargetConditionDraft["personType"],
    attribute: row.attribute as TargetConditionDraft["attribute"],
    operator: row.operator as TargetConditionDraft["operator"],
    value: row.value,
  };
}

function toTarget(row: TargetRow, conditions: ConditionRow[]) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    matchMode: row.matchMode as "all" | "any",
    isEnabled: row.isEnabled,
    conditions: conditions
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map(toCondition),
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function validateConditions(conditions: TargetConditionDraft[]): string | null {
  for (const [index, condition] of conditions.entries()) {
    const error = validateTargetCondition(condition);
    if (error) return `Condition ${index + 1}: ${error}`;
  }
  return null;
}

async function replaceConditions(targetId: string, conditions: TargetConditionDraft[]) {
  await db.delete(targetConditionsTable).where(eq(targetConditionsTable.targetId, targetId));
  if (conditions.length === 0) return;
  await db.insert(targetConditionsTable).values(
    conditions.map((condition, index) => ({
      targetId,
      personType: condition.personType,
      attribute: condition.attribute,
      operator: condition.operator,
      value: condition.operator === "is_known" || condition.operator === "is_unknown"
        ? ""
        : (condition.value ?? "").trim(),
      sortOrder: index,
    })),
  );
}

async function loadTargets(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(audienceTargetsTable)
    .where(inArray(audienceTargetsTable.id, ids));
  const conditions = await db
    .select()
    .from(targetConditionsTable)
    .where(inArray(targetConditionsTable.targetId, ids));
  const byTarget = new Map<string, ConditionRow[]>();
  for (const condition of conditions) {
    const list = byTarget.get(condition.targetId) ?? [];
    list.push(condition);
    byTarget.set(condition.targetId, list);
  }
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows
    .slice()
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((row) => toTarget(row, byTarget.get(row.id) ?? []));
}

router.get("/targets", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListTargetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const agent = await getOwnedAgent(req.userId, parsed.data.agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  await ensureEveryoneTarget(req.userId, parsed.data.agentId);

  const rows = await db
    .select()
    .from(audienceTargetsTable)
    .where(eq(audienceTargetsTable.agentId, parsed.data.agentId))
    .orderBy(audienceTargetsTable.name);

  const loaded = await loadTargets(rows.map((row) => row.id));
  res.json(loaded);
});

router.post("/targets", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = CreateTargetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Target name is required." });
    return;
  }

  const matchMode = parsed.data.matchMode ?? "all";
  if (!isMatchMode(matchMode)) {
    res.status(400).json({ error: "Match mode must be all or any." });
    return;
  }

  const conditionError = validateConditions(parsed.data.conditions);
  if (conditionError) {
    res.status(400).json({ error: conditionError });
    return;
  }

  const agent = await getOwnedAgent(req.userId, parsed.data.agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [row] = await db
    .insert(audienceTargetsTable)
    .values({
      userId: req.userId,
      agentId: parsed.data.agentId,
      name,
      description: parsed.data.description?.trim() ?? "",
      matchMode,
      isEnabled: parsed.data.isEnabled ?? true,
    })
    .returning();

  await replaceConditions(row.id, parsed.data.conditions);
  const [created] = await loadTargets([row.id]);
  res.status(201).json(created);
});

router.patch("/targets/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = UpdateTargetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTargetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(audienceTargetsTable)
    .where(eq(audienceTargetsTable.id, params.data.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Target not found" });
    return;
  }

  if (parsed.data.matchMode !== undefined && !isMatchMode(parsed.data.matchMode)) {
    res.status(400).json({ error: "Match mode must be all or any." });
    return;
  }

  if (parsed.data.conditions) {
    const conditionError = validateConditions(parsed.data.conditions);
    if (conditionError) {
      res.status(400).json({ error: conditionError });
      return;
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Target name is required." });
      return;
    }
    updates.name = name;
  }
  if (parsed.data.description !== undefined) updates.description = parsed.data.description.trim();
  if (parsed.data.matchMode !== undefined) updates.matchMode = parsed.data.matchMode;
  if (parsed.data.isEnabled !== undefined) updates.isEnabled = parsed.data.isEnabled;

  const [row] = await db
    .update(audienceTargetsTable)
    .set(updates)
    .where(eq(audienceTargetsTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Target not found" });
    return;
  }

  if (parsed.data.conditions) {
    await replaceConditions(row.id, parsed.data.conditions);
  }

  const [updated] = await loadTargets([row.id]);
  res.json(updated);
});

router.delete("/targets/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = DeleteTargetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db
    .delete(audienceTargetsTable)
    .where(eq(audienceTargetsTable.id, params.data.id))
    .returning({ id: audienceTargetsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Target not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
