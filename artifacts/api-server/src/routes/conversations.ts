import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  orchestratorLogsTable,
  conversationFeedbackTable,
  intentCategoriesTable,
  orchestratorRulesTable,
  ruleCategoryLinksTable,
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
} from "@workspace/api-zod";
import { getOwnedAgent } from "../lib/agents";

const router: IRouter = Router();

// All conversation endpoints require authentication and are scoped to the authenticated user.
// ── List conversations ────────────────────────────────────────────────────
router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListConversationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, limit = 50, agentId } = parsed.data;
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
  const where = and(ownerFilter, statusFilter, agentFilter);

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

  const [row] = await db
    .insert(conversationsTable)
    .values({ userId: req.userId, agentId, metadata: parsed.data.metadata ?? {} })
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

  // Stage 1: load categories
  stages[0].status = "running";
  const categories = await db
    .select()
    .from(intentCategoriesTable)
    .where(
      and(
        eq(intentCategoriesTable.isEnabled, true),
        conv.agentId ? eq(intentCategoriesTable.agentId, conv.agentId) : undefined,
      ),
    );
  stages[0].status = "completed";
  stages[0].details = { categories_loaded: categories.length };

  // Stage 2: classify intent
  stages[1].status = "running";
  const classification = classifyIntent(parsed.data.content, categories);
  stages[1].status = "completed";
  stages[1].details = { category: classification.primaryCategory, confidence: classification.confidence };

  // Stage 3: load rules
  stages[2].status = "running";
  let rule: typeof orchestratorRulesTable.$inferSelect | null = null;
  if (classification.primaryCategoryId) {
    const links = await db
      .select()
      .from(ruleCategoryLinksTable)
      .where(eq(ruleCategoryLinksTable.categoryId, classification.primaryCategoryId));

    if (links.length > 0) {
      const ruleIds = links.map((l) => l.ruleId);
      const rules = await db
        .select()
        .from(orchestratorRulesTable)
        .where(eq(orchestratorRulesTable.isEnabled, true))
        .orderBy(desc(orchestratorRulesTable.priority));
      rule = rules.find((r) => ruleIds.includes(r.id)) ?? null;
    }
  }
  stages[2].status = "completed";
  stages[2].details = { rule_used: rule?.name ?? "None" };

  // Stage 4: generate response
  stages[3].status = "running";
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
  );
  stages[3].status = "completed";
  stages[3].details = { resolution_status: resolutionStatus };

  const latencyMs = Date.now() - startTs;

  // Save assistant message
  const [assistantMsg] = await db
    .insert(messagesTable)
    .values({ conversationId: conv.id, sender: "assistant", content: responseText })
    .returning();

  // Update conversation
  await db
    .update(conversationsTable)
    .set({ lastActivityAt: new Date(), status: rule?.escalationTrigger ? "escalated" : conv.status })
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
      ruleUsed: rule?.name ?? "None",
      dataSourcesQueried: [],
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

// ── Helpers ───────────────────────────────────────────────────────────────
type Category = typeof intentCategoriesTable.$inferSelect;
type Rule = typeof orchestratorRulesTable.$inferSelect;

function buildStages() {
  return [
    { stage: 1, name: "Load Categories", status: "pending" as string, details: {} as Record<string, unknown> },
    { stage: 2, name: "Classify Intent", status: "pending" as string, details: {} as Record<string, unknown> },
    { stage: 3, name: "Match Rules", status: "pending" as string, details: {} as Record<string, unknown> },
    { stage: 4, name: "Generate Response", status: "pending" as string, details: {} as Record<string, unknown> },
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
    if (rule.escalationTrigger) {
      responseText =
        "I understand this is an important issue. I'm escalating this to a human support agent who will assist you shortly. Please stay on the line.";
      resolutionStatus = "escalated";
    } else if (rule.requiresClarificationPrompt) {
      responseText = rule.requiresClarificationPrompt;
      resolutionStatus = "pending_clarification";
    } else if (rule.promptTemplate) {
      responseText = `Based on your ${classification.primaryCategory} inquiry: ${rule.promptTemplate}`;
      const msgCount = history.filter((m) => m.sender === "user").length;
      if (msgCount >= 2 && !resolutionStatus.includes("resolved")) {
        shouldAskResolution = true;
        responseText +=
          "\n\nDoes this answer your question? Please let me know if you need further assistance.";
        resolutionStatus = "pending_resolution";
      }
    } else {
      responseText = `I understand your ${classification.primaryCategory} request. Let me help you with that. Could you provide more details so I can assist you better?`;
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
