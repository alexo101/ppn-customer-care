import { Router, type IRouter } from "express";
import { eq, and, or, isNull } from "drizzle-orm";
import { db, orchestratorRulesTable, ruleCategoryLinksTable, intentCategoriesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateRuleBody,
  UpdateRuleParams,
  UpdateRuleBody,
  DeleteRuleParams,
  ListRuleCategoriesParams,
  LinkRuleCategoryParams,
  LinkRuleCategoryBody,
  UnlinkRuleCategoryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Returns rules belonging to the authenticated user plus system defaults (null userId).
router.get("/rules", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(orchestratorRulesTable)
    .where(or(eq(orchestratorRulesTable.userId, req.userId), isNull(orchestratorRulesTable.userId)))
    .orderBy(orchestratorRulesTable.priority);
  res.json(rows.map(toRule));
});

router.post("/rules", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(orchestratorRulesTable)
    .values({
      userId: req.userId,
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      promptTemplate: parsed.data.promptTemplate ?? "",
      priority: parsed.data.priority ?? 0,
      requiresClarificationPrompt: parsed.data.requiresClarificationPrompt ?? "",
      escalationTrigger: parsed.data.escalationTrigger ?? false,
      isEnabled: parsed.data.isEnabled ?? true,
    })
    .returning();

  res.status(201).json(toRule(row));
});

router.patch("/rules/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const d = parsed.data as Record<string, unknown>;
  for (const key of ["name", "description", "promptTemplate", "priority", "requiresClarificationPrompt", "escalationTrigger", "isEnabled"]) {
    if (d[key] !== undefined) updates[key] = d[key];
  }

  const [row] = await db
    .update(orchestratorRulesTable)
    .set(updates)
    .where(and(eq(orchestratorRulesTable.id, params.data.id), eq(orchestratorRulesTable.userId, req.userId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  res.json(toRule(row));
});

router.delete("/rules/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db
    .delete(orchestratorRulesTable)
    .where(and(eq(orchestratorRulesTable.id, params.data.id), eq(orchestratorRulesTable.userId, req.userId)))
    .returning({ id: orchestratorRulesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/rules/:id/categories", requireAuth, async (req, res): Promise<void> => {
  const params = ListRuleCategoriesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Verify the rule belongs to this user (or is a system default)
  const [rule] = await db
    .select({ id: orchestratorRulesTable.id })
    .from(orchestratorRulesTable)
    .where(and(
      eq(orchestratorRulesTable.id, params.data.id),
      or(eq(orchestratorRulesTable.userId, req.userId), isNull(orchestratorRulesTable.userId)),
    ));
  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  const links = await db
    .select({ categoryId: ruleCategoryLinksTable.categoryId })
    .from(ruleCategoryLinksTable)
    .where(eq(ruleCategoryLinksTable.ruleId, params.data.id));

  if (links.length === 0) {
    res.json([]);
    return;
  }

  const catIds = links.map((l) => l.categoryId);
  const cats = await db.select().from(intentCategoriesTable)
    .where(or(eq(intentCategoriesTable.userId, req.userId), isNull(intentCategoriesTable.userId)));

  res.json(cats.filter((c) => catIds.includes(c.id)).map(toCategory));
});

router.post("/rules/:id/categories", requireAuth, async (req, res): Promise<void> => {
  const params = LinkRuleCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = LinkRuleCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Verify rule ownership
  const [rule] = await db
    .select({ id: orchestratorRulesTable.id })
    .from(orchestratorRulesTable)
    .where(and(
      eq(orchestratorRulesTable.id, params.data.id),
      or(eq(orchestratorRulesTable.userId, req.userId), isNull(orchestratorRulesTable.userId)),
    ));
  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  await db
    .insert(ruleCategoryLinksTable)
    .values({ ruleId: params.data.id, categoryId: parsed.data.categoryId })
    .onConflictDoNothing();

  res.status(201).json({ success: true });
});

router.delete("/rules/:id/categories/:categoryId", requireAuth, async (req, res): Promise<void> => {
  const params = UnlinkRuleCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Verify rule ownership before deleting link
  const [rule] = await db
    .select({ id: orchestratorRulesTable.id })
    .from(orchestratorRulesTable)
    .where(and(
      eq(orchestratorRulesTable.id, params.data.id),
      or(eq(orchestratorRulesTable.userId, req.userId), isNull(orchestratorRulesTable.userId)),
    ));
  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  await db
    .delete(ruleCategoryLinksTable)
    .where(
      and(
        eq(ruleCategoryLinksTable.ruleId, params.data.id),
        eq(ruleCategoryLinksTable.categoryId, params.data.categoryId),
      ),
    );

  res.sendStatus(204);
});

function toRule(row: typeof orchestratorRulesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    promptTemplate: row.promptTemplate,
    priority: row.priority,
    requiresClarificationPrompt: row.requiresClarificationPrompt,
    escalationTrigger: row.escalationTrigger,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toCategory(row: typeof intentCategoriesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId ?? null,
    description: row.description,
    examples: (row.examples as string[]) ?? [],
    confidenceThreshold: Number(row.confidenceThreshold),
    keywords: (row.keywords as string[]) ?? [],
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export default router;
