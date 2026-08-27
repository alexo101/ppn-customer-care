import { Router, type IRouter } from "express";
import { requireAuthOrDeployment as requireAuth } from "../middlewares/requireAuth";
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
  ruleConnectorLinksTable,
  ruleAudienceTargetLinksTable,
  audienceTargetsTable,
  targetConditionsTable,
  knowledgeSourcesTable,
  apiConnectorsTable,
  agentSettingsTable,
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
import type { ClassificationResult } from "@workspace/api-zod";
import { getOwnedAgent } from "../lib/agents";
import { actionUsesSources, categoryMatchesOperator, normalizeAction } from "../lib/rule-engine";
import { resolveUserEmail } from "../lib/identity";
import {
  AnswerProviderError,
  ClassificationProviderError,
  EmbeddingProviderError,
  createAnswerProvider,
  createClassificationProvider,
  createEmbeddingProvider,
} from "../lib/llm";
import { classifyIntentWithMetadata, isIntentShortcut } from "../lib/classify-intent";
import { generateAnswer, requiresAnswerProvider } from "../lib/generate-answer";
import { retrieveRelevantChunks } from "../lib/retrieval";
import { callConnector } from "../lib/api-connector";
import { applyGuardrails } from "../lib/guardrails";
import { updateConversationAnalytics } from "../lib/conversation-analytics";
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
    .values({
      userId: req.userId,
      agentId,
      metadata,
    })
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
  const storedContext = isPlainObject(existingMeta.context) ? existingMeta.context : {};
  const requestContext: Record<string, unknown> = {
    ...storedContext,
    ...(isPlainObject(parsed.data.context) ? parsed.data.context : {}),
  };
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
      ...requestContext,
    },
  };
  stages[0].status = "completed";
  stages[0].details = {
    person_type: person.personType,
    email_known: Boolean(email),
    context_fields: Object.keys(requestContext).filter((key) => requestContext[key] != null),
  };

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

  let classification: ClassificationResult = {
    primaryCategory: "General",
    primaryCategoryId: "",
    confidence: 0,
    secondaryCategories: [],
    entities: {},
    rule: "None",
    ruleId: "",
  };
  let classificationModel = "none";
  let classificationTokens = 0;
  let rule: Rule | null = null;
  let retrievedChunks: import("../lib/llm").RetrievedChunk[] = [];
  let retrievalModel = "none";
  let retrievalTokens = 0;
  let responseText = "";
  let resolutionStatus = "active";
  let shouldAskResolution = false;
  let answerModel = "none";
  let answerTokens = 0;
  let promptAssembled = "";
  let citations: Array<Record<string, unknown>> = [];
  let dataSourcesQueried: string[] = [];
  let retrievalNeedsClarification = false;
  let retrievalAccessDenied = false;

  try {
    // Stage 3: classify intent with the configured LLM.
    stages[2].status = "running";
    const prevMessages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(messagesTable.createdAt);
    const classificationResult = await classifyIntentWithMetadata(
      parsed.data.content,
      prevMessages,
      categories,
      isIntentShortcut(parsed.data.content)
        ? undefined
        : createClassificationProvider(),
      requestContext,
    );
    classification = classificationResult.classification;
    if (email) classification.entities.email = email;
    classificationModel = classificationResult.model;
    classificationTokens = classificationResult.totalTokens;
    stages[2].status = "completed";
    stages[2].details = {
      category: classification.primaryCategory,
      confidence: classification.confidence,
      probabilities: classificationResult.probabilities,
      model: classificationModel,
    };

    // Stage 4: identify the highest-priority matching rule.
    stages[3].status = "running";
    const classifiedCategory = classification.primaryCategoryId
      ? categories.find((category) => category.id === classification.primaryCategoryId) ?? {
          id: classification.primaryCategoryId,
          name: classification.primaryCategory,
        }
      : classification.primaryCategory
        ? { id: "", name: classification.primaryCategory }
        : null;
    rule = await matchRuleForAgent(conv.agentId, classifiedCategory, person);
    stages[3].status = "completed";
    stages[3].details = {
      rule_used: rule?.name ?? "None",
      operator: rule?.conditionOperator ?? null,
      action: rule?.action ?? null,
      email_known: Boolean(email),
    };

    // Stage 5: retrieve relevant content from sources linked to the rule.
    stages[4].status = "running";
    if (rule && actionUsesSources(rule.action)) {
      const sourceLinks = await db
        .select({
          id: knowledgeSourcesTable.id,
          name: knowledgeSourcesTable.name,
        })
        .from(ruleSourceLinksTable)
        .innerJoin(
          knowledgeSourcesTable,
          eq(ruleSourceLinksTable.sourceId, knowledgeSourcesTable.id),
        )
        .where(eq(ruleSourceLinksTable.ruleId, rule.id));
      if (sourceLinks.length > 0) {
        const retrieval = await retrieveRelevantChunks(
          sourceLinks.map((source) => source.id),
          parsed.data.content,
          createEmbeddingProvider(),
          5,
          { agentId: conv.agentId ?? undefined },
        );
        retrievedChunks = retrieval.chunks;
        retrievalModel = retrieval.model;
        retrievalTokens = retrieval.totalTokens;
        dataSourcesQueried = [
          ...new Set(retrievedChunks.map((chunk) => chunk.sourceName)),
        ];
      }
      if (normalizeAction(rule.action) === "query_live_data") {
        const connectorLinks = await db
          .select({
            id: apiConnectorsTable.id,
            name: apiConnectorsTable.name,
            endpointPattern: apiConnectorsTable.endpointPattern,
            authType: apiConnectorsTable.authType,
            authConfig: apiConnectorsTable.authConfig,
          })
          .from(ruleConnectorLinksTable)
          .innerJoin(
            apiConnectorsTable,
            eq(ruleConnectorLinksTable.connectorId, apiConnectorsTable.id),
          )
          .where(
            and(
              eq(ruleConnectorLinksTable.ruleId, rule.id),
              eq(apiConnectorsTable.isEnabled, true),
            ),
          );
        for (const connector of connectorLinks) {
          dataSourcesQueried.push(connector.name);
          const result = await callConnector(connector, {
            query: parsed.data.content,
            params: classification.entities,
          });
          if (!result.ok && (result.status === 401 || result.status === 403)) {
            retrievalAccessDenied = true;
          }
          if (result.ok && hasUsableConnectorBody(result.body)) {
            retrievedChunks.push({
              sourceId: result.sourceName,
              sourceName: result.sourceName,
              content: JSON.stringify(result.body),
              distance: 0,
              kind: "api",
            });
          }
        }
        dataSourcesQueried = [...new Set(dataSourcesQueried)];
        retrievalNeedsClarification =
          connectorLinks.length === 0 ||
          !retrievedChunks.some((chunk) => chunk.kind === "api");
      }
      if (normalizeAction(rule.action) === "search_answer" && sourceLinks.length > 0 && retrievedChunks.length === 0) {
        retrievalNeedsClarification = true;
      }
    }
    stages[4].status = "completed";
    stages[4].details = {
      chunks_retrieved: retrievedChunks.length,
      sources: dataSourcesQueried,
      model: retrievalModel,
      access_denied: retrievalAccessDenied,
    };

    // Stage 6: generate a grounded answer with the configured LLM.
    stages[5].status = "running";
    const answerRule = !rule
      ? {
          action: "ask clarification",
          description: "",
          promptTemplate: "",
          requiresClarificationPrompt:
            "I couldn't identify a configured support workflow for that request. Could you provide more detail?",
          escalationTrigger: false,
        }
      : (retrievalAccessDenied || retrievalNeedsClarification)
        ? {
            ...rule,
            action: "ask clarification",
            ...(retrievalAccessDenied
              ? {
                  requiresClarificationPrompt:
                    "I don't have permission to access the information needed for this request. Please contact an administrator or human support agent.",
                }
              : {}),
          }
        : rule;
    const [agentSettings] = conv.agentId
      ? await db.select().from(agentSettingsTable).where(eq(agentSettingsTable.agentId, conv.agentId)).limit(1)
      : [];
    const answerResult = await generateAnswer(
      parsed.data.content,
      classification,
      answerRule,
      prevMessages,
      person.attributes,
      retrievedChunks,
      requiresAnswerProvider(parsed.data.content, rule)
        ? createAnswerProvider()
        : undefined,
      {
        ...requestContext,
        ...(agentSettings?.prompt ? { agentPrompt: agentSettings.prompt } : {}),
        ...(agentSettings?.targetAudience ? { targetAudience: agentSettings.targetAudience } : {}),
      },
    );
    responseText = answerResult.responseText;
    resolutionStatus = answerResult.resolutionStatus;
    shouldAskResolution = answerResult.shouldAskResolution;
    answerModel = answerResult.model;
    answerTokens = answerResult.totalTokens;
    promptAssembled = answerResult.promptAssembled;
    citations = answerResult.citations;
    const guardrailResult = applyGuardrails(responseText, {
      retrievedChunks,
      rule: answerRule,
      personAttributes: person.attributes,
    });
    responseText = guardrailResult.responseText;
    if (guardrailResult.blocked) {
      resolutionStatus = "pending_clarification";
      shouldAskResolution = false;
    }
    stages[5].status = "completed";
    stages[5].details = {
      resolution_status: resolutionStatus,
      model: answerModel,
      chunks_used: retrievedChunks.length,
      guardrails: guardrailResult.actions,
    };
  } catch (error) {
    const message = workflowProviderErrorMessage(error);
    res.status(503).json({ error: message });
    return;
  }

  const latencyMs = Date.now() - startTs;
  stages[6].status = "running";

  // Save assistant message
  const [assistantMsg] = await db
    .insert(messagesTable)
    .values({
      conversationId: conv.id,
      sender: "assistant",
      content: responseText,
      metadata: { citations },
    })
    .returning();

  // Update conversation (and capture a subject from the first user message)
  const nextStatus = nextConversationStatus(
    resolutionStatus,
    Boolean(rule && (rule.escalationTrigger || normalizeAction(rule.action) === "escalate")),
    conv.status,
  );
  const conversationPatch: Record<string, unknown> = {
    lastActivityAt: new Date(),
    status: nextStatus,
    metadata: {
      ...existingMeta,
      context: requestContext,
      person: {
        personType: "user",
        user_id: req.userId,
        ...(email ? { email } : {}),
      },
    },
  };
  if (nextStatus === "resolved") conversationPatch.resolvedAt = new Date();
  if (typeof existingMeta.subject !== "string" || !existingMeta.subject.trim()) {
    conversationPatch.metadata = {
      ...(conversationPatch.metadata as Record<string, unknown>),
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
      promptAssembled,
      tokensUsed: String(classificationTokens + retrievalTokens + answerTokens),
      latencyMs: String(latencyMs),
      llmModel: [classificationModel, retrievalModel, answerModel]
        .filter((model) => model !== "none")
        .join(", "),
      resolutionStatus,
    })
    .returning();
  if (nextStatus === "resolved") {
    await updateConversationAnalytics(conv.id);
  }
  stages[6].status = "completed";
  stages[6].details = {
    status: nextStatus,
    confirmation_required: shouldAskResolution,
    feedback_available: nextStatus === "resolved",
  };

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

  const [message] = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.id, parsed.data.messageId),
        eq(messagesTable.conversationId, params.data.id),
      ),
    )
    .limit(1);
  if (!message) {
    res.status(400).json({ error: "Message does not belong to this conversation." });
    return;
  }

  await db.insert(conversationFeedbackTable).values({
    conversationId: params.data.id,
    messageId: parsed.data.messageId ?? null,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
  });
  await updateConversationAnalytics(params.data.id);

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

function hasUsableConnectorBody(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
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
    db.select({ id: intentCategoriesTable.id, name: intentCategoriesTable.name }).from(intentCategoriesTable)
      .where(agentId ? eq(intentCategoriesTable.agentId, agentId) : undefined),
    db.select().from(ruleAudienceTargetLinksTable).where(inArray(ruleAudienceTargetLinksTable.ruleId, ruleIds)),
    db.select().from(audienceTargetsTable).where(agentId ? eq(audienceTargetsTable.agentId, agentId) : undefined),
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

function nextConversationStatus(
  resolutionStatus: string,
  escalated: boolean,
  previousStatus: string,
): string {
  if (escalated || resolutionStatus === "escalated") return "escalated";
  if (resolutionStatus === "resolved") return "resolved";
  if (
    resolutionStatus === "pending_clarification" ||
    resolutionStatus === "pending_resolution"
  ) {
    return "pending_clarification";
  }
  if (resolutionStatus === "active") return "active";
  return previousStatus;
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
    { stage: 5, name: "Retrieve Knowledge", status: "pending" as string, details: {} as Record<string, unknown> },
    { stage: 6, name: "Generate Response", status: "pending" as string, details: {} as Record<string, unknown> },
    { stage: 7, name: "Request Closing", status: "pending" as string, details: {} as Record<string, unknown> },
  ];
}

function workflowProviderErrorMessage(error: unknown): string {
  if (
    error instanceof ClassificationProviderError ||
    error instanceof EmbeddingProviderError ||
    error instanceof AnswerProviderError
  ) {
    return error.message;
  }
  return "The orchestrator is temporarily unavailable. Please try again.";
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
    metadata: row.metadata ?? {},
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
