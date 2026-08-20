import { Router, type IRouter } from "express";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import {
  db,
  orchestratorRulesTable,
  ruleCategoryLinksTable,
  ruleSourceLinksTable,
  ruleAudienceTargetLinksTable,
  ruleVocabulariesTable,
  intentCategoriesTable,
  knowledgeSourcesTable,
  audienceTargetsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListRulesQueryParams,
  CreateRuleBody,
  UpdateRuleParams,
  UpdateRuleBody,
  DeleteRuleParams,
  ListRuleCategoriesParams,
  LinkRuleCategoryParams,
  LinkRuleCategoryBody,
  UnlinkRuleCategoryParams,
  ListRuleVocabulariesQueryParams,
  CreateRuleVocabularyBody,
  UpdateRuleVocabularyParams,
  UpdateRuleVocabularyBody,
  DeleteRuleVocabularyParams,
  SendRuleAuthoringMessageParams,
  SendRuleAuthoringMessageBody,
} from "@workspace/api-zod";

import { getOwnedAgent } from "../lib/agents";
import {
  createRuleAuthoringProvider,
  RuleAuthoringProviderError,
} from "../lib/llm";
import { authorRule, isApproval, isBareRejection } from "../lib/rule-authoring";
import {
  DEFAULT_ACTIONS,
  DEFAULT_OPERATORS,
  normalizeAction,
  slugifyLabel,
} from "../lib/rule-engine";

const router: IRouter = Router();
let builtinVocabulariesReady = false;

const ownerFilter = (userId: string) =>
  or(
    eq(orchestratorRulesTable.userId, userId),
    isNull(orchestratorRulesTable.userId),
  );

router.get("/rules", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListRulesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const agentId = parsed.data.agentId;
  if (agentId) {
    const agent = await getOwnedAgent(req.userId, agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
  }

  const where = agentId
    ? and(ownerFilter(req.userId), eq(orchestratorRulesTable.agentId, agentId))
    : ownerFilter(req.userId);

  const rows = await db
    .select()
    .from(orchestratorRulesTable)
    .where(where)
    .orderBy(orchestratorRulesTable.priority);
  res.json(await toRules(rows));
});

router.post("/rules", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let agentId = parsed.data.agentId ?? null;
  if (agentId) {
    const agent = await getOwnedAgent(req.userId, agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
  }

  const allowed = await validateRuleTargets(
    req.userId,
    agentId,
    parsed.data.categoryIds,
    parsed.data.sourceIds,
    parsed.data.audienceTargetIds,
    res,
  );
  if (!allowed) return;

  const [row] = await db
    .insert(orchestratorRulesTable)
    .values({
      userId: req.userId,
      agentId,
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      promptTemplate: parsed.data.promptTemplate ?? "",
      priority: parsed.data.priority ?? 0,
      requiresClarificationPrompt:
        parsed.data.requiresClarificationPrompt ?? "",
      escalationTrigger:
        parsed.data.escalationTrigger ??
        normalizeAction(parsed.data.action ?? "") === "escalate",
      isEnabled: parsed.data.isEnabled ?? true,
      conditionOperator: parsed.data.conditionOperator?.trim() || "is",
      action: parsed.data.action?.trim() || "search answer",
    })
    .returning();

  await replaceRuleLinks(
    row.id,
    parsed.data.categoryIds ?? [],
    parsed.data.sourceIds ?? [],
    parsed.data.audienceTargetIds ?? [],
  );
  const [created] = await toRules([row]);
  res.status(201).json(created);
});

router.post(
  "/agents/:agentId/rule-authoring/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SendRuleAuthoringMessageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = SendRuleAuthoringMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const agent = await getOwnedAgent(req.userId, params.data.agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    if (
      parsed.data.awaitingConfirmation &&
      parsed.data.draft &&
      (isApproval(parsed.data.message) || isBareRejection(parsed.data.message))
    ) {
      res.json({
        status: isApproval(parsed.data.message) ? "approved" : "needs_changes",
        assistantMessage: isApproval(parsed.data.message)
          ? "Approved. I’ll save this rule now."
          : "What would you like me to change in the proposed rule?",
        draft: parsed.data.draft,
        unresolvedFields: [],
      });
      return;
    }

    await ensureBuiltinVocabularies();
    const [categories, sources, vocabularies, audienceTargets] = await Promise.all([
      db
        .select({
          id: intentCategoriesTable.id,
          name: intentCategoriesTable.name,
        })
        .from(intentCategoriesTable)
        .where(
          and(
            eq(intentCategoriesTable.agentId, params.data.agentId),
            or(
              eq(intentCategoriesTable.userId, req.userId),
              isNull(intentCategoriesTable.userId),
            ),
          ),
        ),
      db
        .select({
          id: knowledgeSourcesTable.id,
          name: knowledgeSourcesTable.name,
        })
        .from(knowledgeSourcesTable)
        .where(
          and(
            eq(knowledgeSourcesTable.agentId, params.data.agentId),
            or(
              eq(knowledgeSourcesTable.userId, req.userId),
              isNull(knowledgeSourcesTable.userId),
            ),
          ),
        ),
      db
        .select({
          kind: ruleVocabulariesTable.kind,
          label: ruleVocabulariesTable.label,
          requiresSource: ruleVocabulariesTable.requiresSource,
        })
        .from(ruleVocabulariesTable)
        .where(
          or(
            and(
              isNull(ruleVocabulariesTable.agentId),
              eq(ruleVocabulariesTable.isBuiltin, true),
            ),
            and(
              eq(ruleVocabulariesTable.agentId, params.data.agentId),
              eq(ruleVocabulariesTable.userId, req.userId),
            ),
          ),
        ),
      db
        .select({
          id: audienceTargetsTable.id,
          name: audienceTargetsTable.name,
          description: audienceTargetsTable.description,
        })
        .from(audienceTargetsTable)
        .where(
          and(
            eq(audienceTargetsTable.agentId, params.data.agentId),
            eq(audienceTargetsTable.isEnabled, true),
            or(
              eq(audienceTargetsTable.userId, req.userId),
              isNull(audienceTargetsTable.userId),
            ),
          ),
        ),
    ]);

    try {
      const result = await authorRule(
        {
          message: parsed.data.message,
          history: parsed.data.history,
          draft: parsed.data.draft,
          awaitingConfirmation: parsed.data.awaitingConfirmation,
          context: {
            categories,
            sources,
            operators: vocabularies
              .filter((item) => item.kind === "operator")
              .map((item) => ({ label: item.label })),
            actions: vocabularies
              .filter((item) => item.kind === "action")
              .map((item) => ({
                label: item.label,
                requiresSource: item.requiresSource,
              })),
            audienceTargets,
          },
        },
        createRuleAuthoringProvider(),
      );
      res.json(result);
    } catch (error) {
      const message =
        error instanceof RuleAuthoringProviderError
          ? error.message
          : "Rule authoring is temporarily unavailable.";
      res.status(503).json({ error: message });
    }
  },
);

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

  const [existing] = await db
    .select()
    .from(orchestratorRulesTable)
    .where(
      and(
        eq(orchestratorRulesTable.id, params.data.id),
        eq(orchestratorRulesTable.userId, req.userId),
      ),
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  const allowed = await validateRuleTargets(
    req.userId,
    existing.agentId,
    parsed.data.categoryIds,
    parsed.data.sourceIds,
    parsed.data.audienceTargetIds,
    res,
  );
  if (!allowed) return;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const d = parsed.data as Record<string, unknown>;
  for (const key of [
    "name",
    "description",
    "promptTemplate",
    "priority",
    "requiresClarificationPrompt",
    "escalationTrigger",
    "isEnabled",
    "conditionOperator",
    "action",
  ]) {
    if (d[key] !== undefined) updates[key] = d[key];
  }
  if (typeof updates.conditionOperator === "string") {
    updates.conditionOperator = updates.conditionOperator.trim() || "is";
  }
  if (typeof updates.action === "string") {
    const action = updates.action.trim() || "search answer";
    updates.action = action;
    if (parsed.data.escalationTrigger === undefined) {
      updates.escalationTrigger = normalizeAction(action) === "escalate";
    }
  }

  const [row] = await db
    .update(orchestratorRulesTable)
    .set(updates)
    .where(
      and(
        eq(orchestratorRulesTable.id, params.data.id),
        eq(orchestratorRulesTable.userId, req.userId),
      ),
    )
    .returning();

  if (!row) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  if (
    parsed.data.categoryIds !== undefined ||
    parsed.data.sourceIds !== undefined ||
    parsed.data.audienceTargetIds !== undefined
  ) {
    const current = (await toRules([row]))[0];
    await replaceRuleLinks(
      row.id,
      parsed.data.categoryIds ?? current.categoryIds,
      parsed.data.sourceIds ?? current.sourceIds,
      parsed.data.audienceTargetIds ?? current.audienceTargetIds,
    );
  }

  const [updated] = await toRules([row]);
  res.json(updated);
});

router.delete("/rules/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db
    .delete(orchestratorRulesTable)
    .where(
      and(
        eq(orchestratorRulesTable.id, params.data.id),
        eq(orchestratorRulesTable.userId, req.userId),
      ),
    )
    .returning({ id: orchestratorRulesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  res.sendStatus(204);
});

router.get(
  "/rules/:id/categories",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListRuleCategoriesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [rule] = await db
      .select({ id: orchestratorRulesTable.id })
      .from(orchestratorRulesTable)
      .where(
        and(
          eq(orchestratorRulesTable.id, params.data.id),
          or(
            eq(orchestratorRulesTable.userId, req.userId),
            isNull(orchestratorRulesTable.userId),
          ),
        ),
      );
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
    const cats = await db
      .select()
      .from(intentCategoriesTable)
      .where(
        or(
          eq(intentCategoriesTable.userId, req.userId),
          isNull(intentCategoriesTable.userId),
        ),
      );

    res.json(cats.filter((c) => catIds.includes(c.id)).map(toCategory));
  },
);

router.post(
  "/rules/:id/categories",
  requireAuth,
  async (req, res): Promise<void> => {
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

    const [rule] = await db
      .select()
      .from(orchestratorRulesTable)
      .where(
        and(
          eq(orchestratorRulesTable.id, params.data.id),
          or(
            eq(orchestratorRulesTable.userId, req.userId),
            isNull(orchestratorRulesTable.userId),
          ),
        ),
      );
    if (!rule) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }

    const allowed = await validateRuleTargets(
      req.userId,
      rule.agentId,
      [parsed.data.categoryId],
      undefined,
      undefined,
      res,
    );
    if (!allowed) return;

    await db
      .insert(ruleCategoryLinksTable)
      .values({ ruleId: params.data.id, categoryId: parsed.data.categoryId })
      .onConflictDoNothing();

    res.status(201).json({ success: true });
  },
);

router.delete(
  "/rules/:id/categories/:categoryId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UnlinkRuleCategoryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [rule] = await db
      .select({ id: orchestratorRulesTable.id })
      .from(orchestratorRulesTable)
      .where(
        and(
          eq(orchestratorRulesTable.id, params.data.id),
          or(
            eq(orchestratorRulesTable.userId, req.userId),
            isNull(orchestratorRulesTable.userId),
          ),
        ),
      );
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
  },
);

router.get(
  "/rule-vocabularies",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ListRuleVocabulariesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const agent = await getOwnedAgent(req.userId, parsed.data.agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await ensureBuiltinVocabularies();

    const kind = parsed.data.kind;
    const rows = await db
      .select()
      .from(ruleVocabulariesTable)
      .where(
        and(
          kind ? eq(ruleVocabulariesTable.kind, kind) : undefined,
          or(
            and(
              isNull(ruleVocabulariesTable.agentId),
              eq(ruleVocabulariesTable.isBuiltin, true),
            ),
            and(
              eq(ruleVocabulariesTable.agentId, parsed.data.agentId),
              eq(ruleVocabulariesTable.userId, req.userId),
            ),
          ),
        ),
      )
      .orderBy(ruleVocabulariesTable.sortOrder, ruleVocabulariesTable.label);

    res.json(rows.map(toVocabulary));
  },
);

router.post(
  "/rule-vocabularies",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = CreateRuleVocabularyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const agent = await getOwnedAgent(req.userId, parsed.data.agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const label = parsed.data.label.trim();
    const slug = slugifyLabel(label);
    if (!label || !slug) {
      res.status(400).json({ error: "A label is required." });
      return;
    }

    await ensureBuiltinVocabularies();

    const existing = await db
      .select()
      .from(ruleVocabulariesTable)
      .where(
        and(
          eq(ruleVocabulariesTable.kind, parsed.data.kind),
          eq(ruleVocabulariesTable.slug, slug),
          or(
            and(
              isNull(ruleVocabulariesTable.agentId),
              eq(ruleVocabulariesTable.isBuiltin, true),
            ),
            eq(ruleVocabulariesTable.agentId, parsed.data.agentId),
          ),
        ),
      );

    if (existing.length > 0) {
      res
        .status(409)
        .json({ error: `That ${parsed.data.kind} already exists.` });
      return;
    }

    const requiresSource =
      parsed.data.requiresSource ??
      (parsed.data.kind === "action" &&
        ["search_answer", "query_live_data"].includes(slug));

    const [row] = await db
      .insert(ruleVocabulariesTable)
      .values({
        userId: req.userId,
        agentId: parsed.data.agentId,
        kind: parsed.data.kind,
        label,
        slug,
        requiresSource,
        isBuiltin: false,
        sortOrder: parsed.data.sortOrder ?? 100,
      })
      .returning();

    res.status(201).json(toVocabulary(row));
  },
);

router.patch(
  "/rule-vocabularies/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateRuleVocabularyParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateRuleVocabularyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(ruleVocabulariesTable)
      .where(
        and(
          eq(ruleVocabulariesTable.id, params.data.id),
          eq(ruleVocabulariesTable.userId, req.userId),
        ),
      )
      .limit(1);

    if (!existing || existing.isBuiltin) {
      res.status(404).json({ error: "Vocabulary not found" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.label !== undefined) {
      const label = parsed.data.label.trim();
      const slug = slugifyLabel(label);
      if (!label || !slug) {
        res.status(400).json({ error: "A label is required." });
        return;
      }
      updates.label = label;
      updates.slug = slug;
    }
    if (parsed.data.requiresSource !== undefined)
      updates.requiresSource = parsed.data.requiresSource;
    if (parsed.data.sortOrder !== undefined)
      updates.sortOrder = parsed.data.sortOrder;

    const [row] = await db
      .update(ruleVocabulariesTable)
      .set(updates)
      .where(
        and(
          eq(ruleVocabulariesTable.id, params.data.id),
          eq(ruleVocabulariesTable.userId, req.userId),
        ),
      )
      .returning();

    if (!row) {
      res.status(404).json({ error: "Vocabulary not found" });
      return;
    }

    res.json(toVocabulary(row));
  },
);

router.delete(
  "/rule-vocabularies/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteRuleVocabularyParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const deleted = await db
      .delete(ruleVocabulariesTable)
      .where(
        and(
          eq(ruleVocabulariesTable.id, params.data.id),
          eq(ruleVocabulariesTable.userId, req.userId),
          eq(ruleVocabulariesTable.isBuiltin, false),
        ),
      )
      .returning({ id: ruleVocabulariesTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Vocabulary not found" });
      return;
    }

    res.sendStatus(204);
  },
);

async function validateRuleTargets(
  userId: string,
  agentId: string | null,
  categoryIds: string[] | undefined,
  sourceIds: string[] | undefined,
  audienceTargetIds: string[] | undefined,
  res: { status: (n: number) => { json: (b: unknown) => void } },
) {
  if (categoryIds?.length) {
    const uniqueIds = [...new Set(categoryIds)];
    const cats = await db
      .select({
        id: intentCategoriesTable.id,
        agentId: intentCategoriesTable.agentId,
        userId: intentCategoriesTable.userId,
      })
      .from(intentCategoriesTable)
      .where(inArray(intentCategoriesTable.id, uniqueIds));
    if (cats.length !== uniqueIds.length) {
      res.status(400).json({ error: "One or more categories were not found." });
      return false;
    }
    const invalid = cats.some((c) => {
      const owned = c.userId === userId || c.userId == null;
      const sameAgent = !agentId || c.agentId === agentId;
      return !owned || !sameAgent;
    });
    if (invalid) {
      res.status(400).json({ error: "Categories must belong to this agent." });
      return false;
    }
  }

  if (sourceIds?.length) {
    const uniqueIds = [...new Set(sourceIds)];
    const sources = await db
      .select({
        id: knowledgeSourcesTable.id,
        agentId: knowledgeSourcesTable.agentId,
        userId: knowledgeSourcesTable.userId,
      })
      .from(knowledgeSourcesTable)
      .where(inArray(knowledgeSourcesTable.id, uniqueIds));
    if (sources.length !== uniqueIds.length) {
      res.status(400).json({ error: "One or more sources were not found." });
      return false;
    }
    const invalid = sources.some((s) => {
      const owned = s.userId === userId || s.userId == null;
      const sameAgent = !agentId || s.agentId === agentId;
      return !owned || !sameAgent;
    });
    if (invalid) {
      res.status(400).json({ error: "Sources must belong to this agent." });
      return false;
    }
  }

  if (audienceTargetIds?.length) {
    const uniqueIds = [...new Set(audienceTargetIds)];
    const targets = await db
      .select({
        id: audienceTargetsTable.id,
        agentId: audienceTargetsTable.agentId,
        userId: audienceTargetsTable.userId,
      })
      .from(audienceTargetsTable)
      .where(inArray(audienceTargetsTable.id, uniqueIds));
    if (targets.length !== uniqueIds.length) {
      res.status(400).json({ error: "One or more audience targets were not found." });
      return false;
    }
    const invalid = targets.some((target) => {
      const owned = target.userId === userId || target.userId == null;
      const sameAgent = !agentId || target.agentId === agentId;
      return !owned || !sameAgent;
    });
    if (invalid) {
      res.status(400).json({ error: "Audience targets must belong to this agent." });
      return false;
    }
  }

  return true;
}

async function replaceRuleLinks(
  ruleId: string,
  categoryIds: string[],
  sourceIds: string[],
  audienceTargetIds: string[],
) {
  await Promise.all([
    db
      .delete(ruleCategoryLinksTable)
      .where(eq(ruleCategoryLinksTable.ruleId, ruleId)),
    db
      .delete(ruleSourceLinksTable)
      .where(eq(ruleSourceLinksTable.ruleId, ruleId)),
    db
      .delete(ruleAudienceTargetLinksTable)
      .where(eq(ruleAudienceTargetLinksTable.ruleId, ruleId)),
  ]);

  const uniqueCategories = [...new Set(categoryIds)];
  const uniqueSources = [...new Set(sourceIds)];
  const uniqueAudienceTargets = [...new Set(audienceTargetIds)];

  await Promise.all([
    uniqueCategories.length > 0
      ? db
          .insert(ruleCategoryLinksTable)
          .values(uniqueCategories.map((categoryId) => ({ ruleId, categoryId })))
      : Promise.resolve(),
    uniqueSources.length > 0
      ? db
          .insert(ruleSourceLinksTable)
          .values(uniqueSources.map((sourceId) => ({ ruleId, sourceId })))
      : Promise.resolve(),
    uniqueAudienceTargets.length > 0
      ? db
          .insert(ruleAudienceTargetLinksTable)
          .values(uniqueAudienceTargets.map((targetId) => ({ ruleId, targetId })))
      : Promise.resolve(),
  ]);
}

async function toRules(rows: (typeof orchestratorRulesTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [categoryLinks, sourceLinks, audienceTargetLinks] = await Promise.all([
    db
      .select()
      .from(ruleCategoryLinksTable)
      .where(inArray(ruleCategoryLinksTable.ruleId, ids)),
    db
      .select()
      .from(ruleSourceLinksTable)
      .where(inArray(ruleSourceLinksTable.ruleId, ids)),
    db
      .select()
      .from(ruleAudienceTargetLinksTable)
      .where(inArray(ruleAudienceTargetLinksTable.ruleId, ids)),
  ]);

  const categoriesByRule = new Map<string, string[]>();
  for (const link of categoryLinks) {
    const list = categoriesByRule.get(link.ruleId) ?? [];
    list.push(link.categoryId);
    categoriesByRule.set(link.ruleId, list);
  }
  const sourcesByRule = new Map<string, string[]>();
  for (const link of sourceLinks) {
    const list = sourcesByRule.get(link.ruleId) ?? [];
    list.push(link.sourceId);
    sourcesByRule.set(link.ruleId, list);
  }
  const audienceTargetsByRule = new Map<string, string[]>();
  for (const link of audienceTargetLinks) {
    const list = audienceTargetsByRule.get(link.ruleId) ?? [];
    list.push(link.targetId);
    audienceTargetsByRule.set(link.ruleId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    promptTemplate: row.promptTemplate,
    priority: row.priority,
    requiresClarificationPrompt: row.requiresClarificationPrompt,
    escalationTrigger: row.escalationTrigger,
    isEnabled: row.isEnabled,
    conditionOperator: row.conditionOperator || "is",
    action: row.action || "search answer",
    agentId: row.agentId ?? null,
    categoryIds: categoriesByRule.get(row.id) ?? [],
    sourceIds: sourcesByRule.get(row.id) ?? [],
    audienceTargetIds: audienceTargetsByRule.get(row.id) ?? [],
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  }));
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

function toVocabulary(row: typeof ruleVocabulariesTable.$inferSelect) {
  return {
    id: row.id,
    agentId: row.agentId ?? null,
    kind: row.kind,
    label: row.label,
    slug: row.slug,
    requiresSource: row.requiresSource,
    isBuiltin: row.isBuiltin,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

async function ensureBuiltinVocabularies() {
  if (builtinVocabulariesReady) return;
  const existing = await db
    .select({ id: ruleVocabulariesTable.id })
    .from(ruleVocabulariesTable)
    .where(
      and(
        eq(ruleVocabulariesTable.isBuiltin, true),
        isNull(ruleVocabulariesTable.agentId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    builtinVocabulariesReady = true;
    return;
  }

  const values = [
    ...DEFAULT_OPERATORS.map((item) => ({
      userId: null as string | null,
      agentId: null as string | null,
      kind: "operator",
      label: item.label,
      slug: item.slug,
      requiresSource: item.requiresSource,
      isBuiltin: true,
      sortOrder: item.sortOrder,
    })),
    ...DEFAULT_ACTIONS.map((item) => ({
      userId: null as string | null,
      agentId: null as string | null,
      kind: "action",
      label: item.label,
      slug: item.slug,
      requiresSource: item.requiresSource,
      isBuiltin: true,
      sortOrder: item.sortOrder,
    })),
  ];

  await db.insert(ruleVocabulariesTable).values(values);
  builtinVocabulariesReady = true;
}

export default router;
