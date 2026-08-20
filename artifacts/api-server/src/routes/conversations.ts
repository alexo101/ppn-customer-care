import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { eq, desc, sql, and, gte, lte, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  orchestratorLogsTable,
  conversationFeedbackTable,
  intentCategoriesTable,
  orchestratorRulesTable,
  ruleCategoryLinksTable,
  ruleSourceLinksTable,
  ruleAudienceTargetLinksTable,
  audienceTargetsTable,
  targetConditionsTable,
  knowledgeSourcesTable,
} from "@workspace/db";
import {
  ListConversationsQueryParams,
  CreateConversationBody,
  GetConversationParams,
  UpdateConversationParams,
  UpdateConversationBody,
  ListMessagesParams,
  SendMessageParams,
  SendMessageBody,
  SubmitFeedbackParams,
  SubmitFeedbackBody,
  ListConversationLogsParams,
  ListQuestionsQueryParams,
} from "@workspace/api-zod";
import { getOwnedAgent } from "../lib/agents";
import { actionUsesSources, categoryMatchesOperator, normalizeAction } from "../lib/rule-engine";
import { resolveUserEmail } from "../lib/identity";
import {
  matchesAudienceTarget,
  type AudienceTargetForMatching,
  type PersonAttributes,
} from "../lib/targets";

const router: IRouter = Router();

// All conversation endpoints require authentication and are scoped to the authenticated user.
// ── List conversations ────────────────────────────────────────────────────
router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListConversationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, limit = 50, agentId, source, fromDate, toDate } = parsed.data;
  const userId = req.userId;

  if (agentId) {
    const agent = await getOwnedAgent(userId, agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
  }

  const ownerFilter = eq(conversationsTable.userId, userId);
  const statusFilter = status ? eq(conversationsTable.status, status) : undefined;
  const agentFilter = agentId ? eq(conversationsTable.agentId, agentId) : undefined;
  const sourceFilter = conversationSourceFilter(source);
  const dateFilters = conversationDateFilters(fromDate, toDate);
  const where = and(ownerFilter, statusFilter, agentFilter, sourceFilter, ...dateFilters);

  const rows = await db
    .select()
    .from(conversationsTable)
    .where(where)
    .orderBy(desc(conversationsTable.lastActivityAt))
    .limit(Math.min(limit as number, 200));

  res.json(rows.map(toConversation));
});

// ── Create conversation ───────────────────────────────────────────────────
router.post("/conversations", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
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

  const email = await resolveUserEmail(req.userId, req.userEmail);
  const metadata = isPlainObject(parsed.data.metadata)
    ? {
        ...parsed.data.metadata,
        person: {
          personType: "user",
          user_id: req.userId,
          ...(email ? { email } : {}),
        },
      }
    : {
        person: {
          personType: "user",
          user_id: req.userId,
          ...(email ? { email } : {}),
        },
      };

  const [row] = await db
    .insert(conversationsTable)
    .values({ userId: req.userId, agentId, metadata })
    .returning();

  res.status(201).json(toConversation(row));
});

// ── Get conversation ──────────────────────────────────────────────────────
router.get("/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, req.userId)));

  if (!row) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(toConversation(row));
});

// ── Update conversation ───────────────────────────────────────────────────
router.patch("/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {
    lastActivityAt: new Date(),
  };
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.metadata) updates.metadata = parsed.data.metadata;
  if (parsed.data.status === "resolved" || parsed.data.status === "closed") {
    updates.resolvedAt = new Date();
  }

  const [row] = await db
    .update(conversationsTable)
    .set(updates)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, req.userId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(toConversation(row));
});

// ── List messages ─────────────────────────────────────────────────────────
router.get("/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Verify ownership before returning messages
  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, req.userId)));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);

  res.json(rows.map(toMessage));
});

// ── Send message (orchestrator) ────────────────────────────────────────────
router.post("/conversations/:id/send", requireAuth, async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Verify ownership before allowing message to be sent
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, req.userId)));

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Save user message
  const [userMsg] = await db
    .insert(messagesTable)
    .values({ conversationId: conv.id, sender: "user", content: parsed.data.content })
    .returning();

  // Run orchestrator logic
  const startTs = Date.now();
  const stages = buildStages();

  // Stage 1: capture authenticated user identity
  stages[0].status = "running";
  const existingMeta = isPlainObject(conv.metadata) ? conv.metadata : {};
  const existingPerson = isPlainObject(existingMeta.person)
    ? existingMeta.person
    : {};
  const email =
    (await resolveUserEmail(req.userId, req.userEmail)) ??
    (typeof existingPerson.email === "string" ? existingPerson.email : null);
  const person: PersonAttributes = {
    personType: "user",
    attributes: {
      user_id: req.userId,
      ...(email ? { email } : {}),
    },
  };
  stages[0].status = "completed";
  stages[0].details = { person_type: person.personType, email_known: Boolean(email) };

  // Stage 2: load categories
  stages[1].status = "running";
  const categories = await db
    .select()
    .from(intentCategoriesTable)
    .where(
      and(
        eq(intentCategoriesTable.isEnabled, true),
        conv.agentId ? eq(intentCategoriesTable.agentId, conv.agentId) : undefined,
      ),
    );
  stages[1].status = "completed";
  stages[1].details = { categories_loaded: categories.length };

  // Stage 3: classify intent
  stages[2].status = "running";
  const classification = classifyIntent(parsed.data.content, categories);
  if (email) classification.entities.email = email;
  stages[2].status = "completed";
  stages[2].details = { category: classification.primaryCategory, confidence: classification.confidence };

  // Stage 4: load rules
  stages[3].status = "running";
  const classifiedCategory = classification.primaryCategoryId
    ? categories.find((category) => category.id === classification.primaryCategoryId) ?? {
        id: classification.primaryCategoryId,
        name: classification.primaryCategory,
      }
    : classification.primaryCategory
      ? { id: "", name: classification.primaryCategory }
      : null;

  const rule = await matchRuleForAgent(conv.agentId, classifiedCategory, person);
  stages[3].status = "completed";
  stages[3].details = {
    rule_used: rule?.name ?? "None",
    operator: rule?.conditionOperator ?? null,
    action: rule?.action ?? null,
    email_known: Boolean(email),
  };

  let dataSourcesQueried: string[] = [];
  if (rule && actionUsesSources(rule.action)) {
    const sourceLinks = await db
      .select({ name: knowledgeSourcesTable.name })
      .from(ruleSourceLinksTable)
      .innerJoin(knowledgeSourcesTable, eq(ruleSourceLinksTable.sourceId, knowledgeSourcesTable.id))
      .where(eq(ruleSourceLinksTable.ruleId, rule.id));
    dataSourcesQueried = sourceLinks.map((row) => row.name);
  }

  // Stage 5: generate response
  stages[4].status = "running";
  const prevMessages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conv.id))
    .orderBy(messagesTable.createdAt);

  const { responseText, resolutionStatus, shouldAskResolution } = generateResponse(
    parsed.data.content,
    classification,
    rule,
    prevMessages,
    person.attributes,
  );
  stages[4].status = "completed";
  stages[4].details = { resolution_status: resolutionStatus };

  const latencyMs = Date.now() - startTs;

  // Save assistant message
  const [assistantMsg] = await db
    .insert(messagesTable)
    .values({ conversationId: conv.id, sender: "assistant", content: responseText })
    .returning();

  // Update conversation (and capture a subject from the first user message)
  const conversationPatch: Record<string, unknown> = {
    lastActivityAt: new Date(),
    status: rule && (rule.escalationTrigger || normalizeAction(rule.action) === "escalate") ? "escalated" : conv.status,
  };
  if (!isPlainObject(existingMeta.person) || existingMeta.person.email !== email) {
    conversationPatch.metadata = {
      ...existingMeta,
      person: {
        personType: "user",
        user_id: req.userId,
        ...(email ? { email } : {}),
      },
    };
  }
  if (typeof existingMeta.subject !== "string" || !existingMeta.subject.trim()) {
    conversationPatch.metadata = {
      ...(isPlainObject(conversationPatch.metadata)
        ? conversationPatch.metadata
        : {}),
      ...existingMeta,
      person: {
        personType: "user",
        user_id: req.userId,
        ...(email ? { email } : {}),
      },
      subject: parsed.data.content.slice(0, 120),
    };
  }

  await db
    .update(conversationsTable)
    .set(conversationPatch)
    .where(eq(conversationsTable.id, conv.id));

  // Save orchestrator log
  const [log] = await db
    .insert(orchestratorLogsTable)
    .values({
      conversationId: conv.id,
      messageId: assistantMsg.id,
      detectedCategory: classification.primaryCategory,
      confidenceScore: String(classification.confidence),
      secondaryCategories: classification.secondaryCategories,
      detectedEntities: classification.entities,
      ruleUsed: rule ? `${rule.name} (${rule.conditionOperator} / ${rule.action})` : "None",
      dataSourcesQueried,
      promptAssembled: rule?.promptTemplate ?? "",
      tokensUsed: String(Math.floor(parsed.data.content.length / 4)),
      latencyMs: String(latencyMs),
      llmModel: "simulated-v1",
      resolutionStatus,
    })
    .returning();

  res.json({
    message: toMessage(assistantMsg),
    response: responseText,
    stages,
    classification,
    shouldAskResolution,
    log: toLog(log),
  });
});

// ── Submit feedback ───────────────────────────────────────────────────────
router.post("/conversations/:id/feedback", requireAuth, async (req, res): Promise<void> => {
  const params = SubmitFeedbackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Verify ownership
  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, req.userId)));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const parsed = SubmitFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.insert(conversationFeedbackTable).values({
    conversationId: params.data.id,
    messageId: parsed.data.messageId ?? null,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
  });

  res.status(201).json({ success: true });
});

// ── List conversation logs ────────────────────────────────────────────────
router.get("/conversations/:id/logs", requireAuth, async (req, res): Promise<void> => {
  const params = ListConversationLogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Verify ownership before returning logs
  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, req.userId)));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const rows = await db
    .select()
    .from(orchestratorLogsTable)
    .where(eq(orchestratorLogsTable.conversationId, params.data.id))
    .orderBy(orchestratorLogsTable.createdAt);

  res.json(rows.map(toLog));
});

// ── List questions from deployed (widget) conversations ───────────────────
router.get("/questions", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListQuestionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { agentId, type, fromDate, toDate, limit = 200 } = parsed.data;
  const agent = await getOwnedAgent(req.userId, agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const convos = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.userId, req.userId),
        eq(conversationsTable.agentId, agentId),
        conversationSourceFilter("widget"),
      ),
    )
    .orderBy(desc(conversationsTable.lastActivityAt))
    .limit(500);

  if (convos.length === 0) {
    res.json([]);
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(inArray(messagesTable.conversationId, convos.map((c) => c.id)))
    .orderBy(messagesTable.createdAt);

  const messagesByConv = new Map<string, typeof messages>();
  for (const message of messages) {
    const list = messagesByConv.get(message.conversationId) ?? [];
    list.push(message);
    messagesByConv.set(message.conversationId, list);
  }

  const from = parseDayStart(fromDate);
  const to = parseDayEnd(toDate);
  const questions: ReturnType<typeof toQuestion>[] = [];

  for (const conv of convos) {
    const convMessages = messagesByConv.get(conv.id) ?? [];
    const userMessages = convMessages.filter((m) => m.sender === "user");

    userMessages.forEach((message, index) => {
      const createdAt = message.createdAt ?? new Date(0);
      if (from && createdAt < from) return;
      if (to && createdAt > to) return;

      const hasAssistantAfter = convMessages.some(
        (other) => other.sender === "assistant" && other.createdAt > createdAt,
      );
      const isLastUser = index === userMessages.length - 1;
      const questionType = classifyQuestionType(conv.status, hasAssistantAfter, isLastUser);
      if (type && questionType !== type) return;

      questions.push(
        toQuestion({
          id: message.id,
          conversationId: conv.id,
          content: message.content,
          type: questionType,
          conversationStatus: conv.status,
          createdAt,
        }),
      );
    });
  }

  questions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(questions.slice(0, Math.min(limit as number, 500)));
});

// ── Helpers ───────────────────────────────────────────────────────────────
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseDayStart(value?: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDayEnd(value?: string): Date | null {
  const start = parseDayStart(value);
  if (!start) return null;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
}

function conversationSourceFilter(source?: string) {
  if (source === "widget") {
    return sql`${conversationsTable.metadata}->>'source' = 'widget'`;
  }
  if (source === "training" || source === "console") {
    return sql`coalesce(${conversationsTable.metadata}->>'source', '') <> 'widget'`;
  }
  return undefined;
}

function conversationDateFilters(fromDate?: string, toDate?: string) {
  const filters = [];
  const from = parseDayStart(fromDate);
  const to = parseDayEnd(toDate);
  if (from) filters.push(gte(conversationsTable.lastActivityAt, from));
  if (to) filters.push(lte(conversationsTable.lastActivityAt, to));
  return filters;
}

type Category = typeof intentCategoriesTable.$inferSelect;
type Rule = typeof orchestratorRulesTable.$inferSelect;
type QuestionType = "question" | "unanswered" | "escalated";

async function matchRuleForAgent(
  agentId: string | null,
  classified: { id: string; name: string } | null,
  person: PersonAttributes,
): Promise<Rule | null> {
  const rules = await db
    .select()
    .from(orchestratorRulesTable)
    .where(
      and(
        eq(orchestratorRulesTable.isEnabled, true),
        agentId ? eq(orchestratorRulesTable.agentId, agentId) : undefined,
      ),
    )
    .orderBy(desc(orchestratorRulesTable.priority));

  if (rules.length === 0) return null;

  const ruleIds = rules.map((rule) => rule.id);
  const [categoryLinks, categoryRows, audienceLinks, audienceRows, conditionRows] = await Promise.all([
    db.select().from(ruleCategoryLinksTable).where(inArray(ruleCategoryLinksTable.ruleId, ruleIds)),
    db.select({ id: intentCategoriesTable.id, name: intentCategoriesTable.name }).from(intentCategoriesTable),
    db.select().from(ruleAudienceTargetLinksTable).where(inArray(ruleAudienceTargetLinksTable.ruleId, ruleIds)),
    db.select().from(audienceTargetsTable),
    db.select().from(targetConditionsTable),
  ]);

  const categoriesById = new Map(categoryRows.map((category) => [category.id, category]));
  const targetsByRule = new Map<string, { id: string; name: string }[]>();
  for (const link of categoryLinks) {
    const category = categoriesById.get(link.categoryId);
    if (!category) continue;
    const list = targetsByRule.get(link.ruleId) ?? [];
    list.push(category);
    targetsByRule.set(link.ruleId, list);
  }

  const targetRowsById = new Map(audienceRows.map((target) => [target.id, target]));
  const conditionsByTarget = new Map<string, typeof conditionRows>();
  for (const condition of conditionRows) {
    const list = conditionsByTarget.get(condition.targetId) ?? [];
    list.push(condition);
    conditionsByTarget.set(condition.targetId, list);
  }

  const audienceTargetsByRule = new Map<string, AudienceTargetForMatching[]>();
  for (const link of audienceLinks) {
    const target = targetRowsById.get(link.targetId);
    if (!target) continue;
    const list = audienceTargetsByRule.get(link.ruleId) ?? [];
    list.push({
      isEnabled: target.isEnabled,
      matchMode: target.matchMode === "any" ? "any" : "all",
      conditions: (conditionsByTarget.get(target.id) ?? []).map((condition) => ({
        personType: condition.personType,
        attribute: condition.attribute,
        operator: condition.operator,
        value: condition.value,
      })),
    });
    audienceTargetsByRule.set(link.ruleId, list);
  }

  return rules.find((rule) => {
    if (!categoryMatchesOperator(
      rule.conditionOperator,
      classified,
      targetsByRule.get(rule.id) ?? [],
    )) {
      return false;
    }

    const audienceTargets = audienceTargetsByRule.get(rule.id) ?? [];
    return (
      audienceTargets.length === 0 ||
      audienceTargets.some((target) => matchesAudienceTarget(target, person))
    );
  }) ?? null;
}

function classifyQuestionType(
  conversationStatus: string,
  hasAssistantAfter: boolean,
  isLastUser: boolean,
): QuestionType {
  if (conversationStatus === "escalated" && isLastUser) return "escalated";
  if (!hasAssistantAfter) return "unanswered";
  if (isLastUser && conversationStatus !== "resolved" && conversationStatus !== "closed") {
    return "unanswered";
  }
  return "question";
}

function toQuestion(row: {
  id: string;
  conversationId: string;
  content: string;
  type: QuestionType;
  conversationStatus: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    content: row.content,
    type: row.type,
    conversationStatus: row.conversationStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildStages() {
  return [
    { stage: 1, name: "Capture User Identity", status: "pending" as string, details: {} as Record<string, unknown> },
    { stage: 2, name: "Load Categories", status: "pending" as string, details: {} as Record<string, unknown> },
    { stage: 3, name: "Classify Intent", status: "pending" as string, details: {} as Record<string, unknown> },
    { stage: 4, name: "Match Rules", status: "pending" as string, details: {} as Record<string, unknown> },
    { stage: 5, name: "Generate Response", status: "pending" as string, details: {} as Record<string, unknown> },
  ];
}

function classifyIntent(message: string, categories: Category[]) {
  const lower = message.toLowerCase().trim();
  const RESOLUTION = ["thanks", "thank you", "solved", "that works", "perfect", "got it", "great", "resolved"];
  const GREETING = ["hello", "hi", "hey", "good morning", "good afternoon"];

  if (RESOLUTION.some((k) => lower.includes(k))) {
    return {
      primaryCategory: "Resolution",
      primaryCategoryId: "",
      confidence: 0.95,
      secondaryCategories: [],
      entities: {},
      rule: "None",
      ruleId: "",
    };
  }
  if (GREETING.some((k) => lower.startsWith(k))) {
    return {
      primaryCategory: "Greeting",
      primaryCategoryId: "",
      confidence: 0.9,
      secondaryCategories: [],
      entities: {},
      rule: "None",
      ruleId: "",
    };
  }

  const scored: { cat: Category; score: number }[] = [];
  for (const cat of categories) {
    let score = 0;
    for (const kw of (cat.keywords as string[]) ?? []) {
      if (lower.includes(kw.toLowerCase())) score += 1;
    }
    for (const ex of (cat.examples as string[]) ?? []) {
      const exl = ex.toLowerCase().replace("...", "");
      if (lower.includes(exl) || exl.includes(lower)) score += 2;
    }
    if (score > 0) scored.push({ cat, score });
  }
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const fallback = categories[0];
    return {
      primaryCategory: fallback?.name ?? "General",
      primaryCategoryId: fallback?.id ?? "",
      confidence: 0.5,
      secondaryCategories: [],
      entities: {},
      rule: "None",
      ruleId: "",
    };
  }

  const maxScore = scored[0].score;
  const confidence = Math.min(0.99, 0.5 + maxScore * 0.1);
  const primary = scored[0].cat;
  const secondary = scored.slice(1, 3).filter((s) => s.score > 0).map((s) => s.cat.name);

  const entities: Record<string, unknown> = {};
  const uuidMatch = lower.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (uuidMatch) entities.detected_uuid = uuidMatch[0];

  return {
    primaryCategory: primary.name,
    primaryCategoryId: primary.id,
    confidence,
    secondaryCategories: secondary,
    entities,
    rule: "None",
    ruleId: "",
  };
}

function generateResponse(
  message: string,
  classification: ReturnType<typeof classifyIntent>,
  rule: Rule | null,
  history: (typeof messagesTable.$inferSelect)[],
  attributes: Record<string, unknown>,
) {
  const lower = message.toLowerCase().trim();
  const RESOLUTION = ["thanks", "thank you", "solved", "that works", "perfect", "got it", "great", "resolved"];
  const GREETING = ["hello", "hi", "hey", "good morning", "good afternoon"];
  const GREETINGS_RESPONSES = [
    "Hello! I'm your AI support assistant. How can I help you today?",
    "Hi there! What can I assist you with?",
    "Welcome! I'm here to help. What do you need?",
  ];

  let responseText = "";
  let resolutionStatus = "active";
  let shouldAskResolution = false;

  if (RESOLUTION.some((k) => lower.includes(k))) {
    responseText = "Great to hear! If you need anything else, don't hesitate to reach out. Have a great day!";
    resolutionStatus = "resolved";
  } else if (GREETING.some((k) => lower.startsWith(k))) {
    responseText = GREETINGS_RESPONSES[Math.floor(Math.random() * GREETINGS_RESPONSES.length)];
  } else if (rule) {
    const actionKind = normalizeAction(rule.action);
    if (rule.escalationTrigger || actionKind === "escalate") {
      responseText =
        "I understand this is an important issue. I'm escalating this to a human support agent who will assist you shortly. Please stay on the line.";
      resolutionStatus = "escalated";
    } else if (actionKind === "ask_clarification") {
      responseText = rule.requiresClarificationPrompt
        ? renderTemplate(rule.requiresClarificationPrompt, attributes)
        : `I need a bit more detail about your ${classification.primaryCategory} request before I can continue.`;
      resolutionStatus = "pending_clarification";
    } else if (actionKind === "search_answer" || actionKind === "query_live_data") {
      const sourceHint = rule.action.trim() || "search answer";
      const promptTemplate = renderTemplate(rule.promptTemplate, attributes);
      responseText = promptTemplate
        ? `Based on your ${classification.primaryCategory} inquiry, I will ${sourceHint}. ${promptTemplate}`
        : `I'll ${sourceHint} for your ${classification.primaryCategory} inquiry and use the linked source to respond.`;
      const msgCount = history.filter((m) => m.sender === "user").length;
      if (msgCount >= 2 && !resolutionStatus.includes("resolved")) {
        shouldAskResolution = true;
        responseText +=
          "\n\nDoes this answer your question? Please let me know if you need further assistance.";
        resolutionStatus = "pending_resolution";
      }
    } else if (actionKind === "generate_from_template" && rule.promptTemplate) {
      responseText = `Based on your ${classification.primaryCategory} inquiry: ${renderTemplate(rule.promptTemplate, attributes)}`;
      const msgCount = history.filter((m) => m.sender === "user").length;
      if (msgCount >= 2 && !resolutionStatus.includes("resolved")) {
        shouldAskResolution = true;
        responseText +=
          "\n\nDoes this answer your question? Please let me know if you need further assistance.";
        resolutionStatus = "pending_resolution";
      }
    } else if (rule.promptTemplate) {
      responseText = `Based on your ${classification.primaryCategory} inquiry, I will ${rule.action}. ${renderTemplate(rule.promptTemplate, attributes)}`;
    } else {
      responseText = `I understand your ${classification.primaryCategory} request. I will ${rule.action}. Could you provide more details so I can assist you better?`;
    }
  } else {
    const fallbacks: Record<string, string> = {
      Greeting: GREETINGS_RESPONSES[0],
      Resolution: "Great to hear! Have a great day!",
    };
    responseText =
      fallbacks[classification.primaryCategory] ??
      `Thank you for reaching out about your ${classification.primaryCategory} inquiry. I'm here to help. Could you provide more details?`;
    const msgCount = history.filter((m) => m.sender === "user").length;
    if (msgCount >= 3) {
      shouldAskResolution = true;
      resolutionStatus = "pending_resolution";
    }
  }

  return { responseText, resolutionStatus, shouldAskResolution };
}

function renderTemplate(template: string, attributes: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = attributes[key];
    return value == null ? "" : String(value);
  });
}

function toConversation(row: typeof conversationsTable.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    metadata: row.metadata ?? {},
    lastActivityAt: row.lastActivityAt?.toISOString() ?? new Date().toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    agentId: row.agentId ?? null,
  };
}

function toMessage(row: typeof messagesTable.$inferSelect) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sender: row.sender,
    content: row.content,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toLog(row: typeof orchestratorLogsTable.$inferSelect) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId ?? null,
    detectedCategory: row.detectedCategory,
    confidenceScore: Number(row.confidenceScore),
    secondaryCategories: (row.secondaryCategories as string[]) ?? [],
    detectedEntities: (row.detectedEntities as Record<string, unknown>) ?? {},
    ruleUsed: row.ruleUsed,
    dataSourcesQueried: (row.dataSourcesQueried as string[]) ?? [],
    promptAssembled: row.promptAssembled,
    tokensUsed: Number(row.tokensUsed),
    latencyMs: Number(row.latencyMs),
    llmModel: row.llmModel,
    resolutionStatus: row.resolutionStatus,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export default router;
