import { Router, type IRouter } from "express";
import { performance } from "node:perf_hooks";
import { requireAuthOrDeployment as requireAuth } from "../middlewares/requireAuth";
import { eq, desc, sql, and, gte, lte, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  orchestratorLogsTable,
  conversationFeedbackTable,
  agentConversationSettingsTable,
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
  SubmitConversationNpsBody,
  SubmitConversationNpsParams,
  SubmitConversationRatingBody,
  SubmitConversationRatingParams,
  EscalateConversationBody,
} from "@workspace/api-zod";
import { getOwnedAgent } from "../lib/agents";
import { resolveUserDisplayName, resolveUserEmail } from "../lib/identity";
import { sendWelcomeMessageIfNeeded } from "../lib/welcome-message";
import { DEFAULT_CONVERSATION_SETTINGS } from "../lib/conversation-auto-close";
import { isUnableToAnswerMessageMetadata } from "../lib/unanswered-message";
import { answerFromKnowledge, workflowProviderErrorMessage } from "../lib/answer-question";
import { getAgentCommunicationLanguage } from "../lib/agent-communication-language";
import { toPublicMessage } from "../lib/conversation-message";
import { localizedCommunicationMessage } from "../lib/reply-locale";
import { updateConversationAnalytics } from "../lib/conversation-analytics";
import { appDomainAttribute, type PersonAttributes } from "../lib/targets";
import {
  getAssignedConversation,
  markConversationEscalationUnread,
  upsertEscalationForConversation,
} from "../lib/escalations";
import {
  ConversationLifecycleError,
  submitConversationNps,
  submitConversationRating,
} from "../lib/conversation-lifecycle";

const router: IRouter = Router();

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

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
  const statusFilter = status
    ? eq(conversationsTable.status, status)
    : undefined;
  const agentFilter = agentId
    ? eq(conversationsTable.agentId, agentId)
    : undefined;
  const sourceFilter = conversationSourceFilter(source);
  const dateFilters = conversationDateFilters(fromDate, toDate);
  const where = and(
    ownerFilter,
    statusFilter,
    agentFilter,
    sourceFilter,
    ...dateFilters,
  );

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
  let agentName: string | null = null;
  if (agentId) {
    const agent = await getOwnedAgent(req.userId, agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    agentName = agent.name;
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

  const userName = await resolveUserDisplayName(req.userId, req.userEmail);
  await sendWelcomeMessageIfNeeded({
    conversationId: row.id,
    agentId,
    metadata,
    userName,
    agentName,
  });

  res.status(201).json(toConversation(row));
});

// ── Get conversation ──────────────────────────────────────────────────────
router.get(
  "/conversations/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetConversationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    let [row] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, params.data.id),
          eq(conversationsTable.userId, req.userId),
        ),
      );

    if (!row && req.workspaceMemberId) {
      const assigned = await getAssignedConversation(
        params.data.id,
        req.workspaceMemberId,
        req.memberRole,
      );
      if (assigned) row = assigned;
    }
    if (!row) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json(toConversation(row));
  },
);

// ── Update conversation ───────────────────────────────────────────────────
router.patch(
  "/conversations/:id",
  requireAuth,
  async (req, res): Promise<void> => {
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
      .where(
        and(
          eq(conversationsTable.id, params.data.id),
          eq(conversationsTable.userId, req.userId),
        ),
      )
      .returning();

    if (!row) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json(toConversation(row));
  },
);

// ── List messages ─────────────────────────────────────────────────────────
router.get(
  "/conversations/:id/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // Verify ownership before returning messages
    let [conv] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, params.data.id),
          eq(conversationsTable.userId, req.userId),
        ),
      );
    if (!conv && req.workspaceMemberId) {
      const assigned = await getAssignedConversation(
        params.data.id,
        req.workspaceMemberId,
        req.memberRole,
      );
      if (assigned) conv = { id: assigned.id };
    }
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, params.data.id))
      .orderBy(messagesTable.createdAt);

    res.json(rows.map(toPublicMessage));
  },
);

router.post(
  "/conversations/:id/escalate",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetConversationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = EscalateConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, params.data.id),
          eq(conversationsTable.userId, req.userId),
        ),
      );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (!conversation.agentId) {
      res.status(400).json({ error: "Conversation has no assigned agent" });
      return;
    }

    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversation.id))
      .orderBy(messagesTable.createdAt);
    const latestOffer = [...messages]
      .reverse()
      .find((message) => isUnableToAnswerMessageMetadata(message.metadata));
    if (!latestOffer || latestOffer.id !== parsed.data.messageId) {
      res.status(400).json({
        error: "That escalation offer is no longer available.",
      });
      return;
    }
    const offerIndex = messages.findIndex(
      (message) => message.id === latestOffer.id,
    );
    if (
      messages
        .slice(offerIndex + 1)
        .some((message) => message.sender === "user")
    ) {
      res.status(400).json({
        error: "Ask a new question before escalating this message.",
      });
      return;
    }

    const userQuestion = [...messages]
      .slice(0, offerIndex)
      .reverse()
      .find((message) => message.sender === "user");
    if (!userQuestion) {
      res
        .status(400)
        .json({ error: "No user question is available to escalate." });
      return;
    }
    const [latestLog] = await db
      .select()
      .from(orchestratorLogsTable)
      .where(eq(orchestratorLogsTable.conversationId, conversation.id))
      .orderBy(desc(orchestratorLogsTable.createdAt))
      .limit(1);

    const escalation = await upsertEscalationForConversation({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      reason: "The visitor requested escalation after an unanswered question.",
      category: "",
      subcategory: "",
      retrievedInformation: (latestLog?.articlesUsed ?? []).map((name) => ({ sourceName: name })),
      previousAnswer: latestOffer.content,
      context: {
        userQuestion: userQuestion.content,
        userId: req.userId,
        ...(latestLog
          ? {
              resolutionStatus: latestLog.resolutionStatus,
              articlesUsed: latestLog.articlesUsed,
            }
          : {}),
      },
    });
    if (!escalation) {
      res.status(400).json({ error: "Could not create an escalation." });
      return;
    }

    await db
      .update(conversationsTable)
      .set({
        status: "escalated",
        lastActivityAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversation.id));

    res.json({
      conversationId: conversation.id,
      status: "escalated",
      escalationId: escalation.id,
    });
  },
);

// ── Send message (orchestrator) ────────────────────────────────────────────
router.post(
  "/conversations/:id/send",
  requireAuth,
  async (req, res): Promise<void> => {
    const requestStartedAt = performance.now();
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

    // Lock the conversation while accepting the user message so an inactivity
    // sweep cannot close it between the ownership check and activity update.
    const start = await db.transaction(async (tx) => {
      const [conversation] = await tx
        .select()
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.id, params.data.id),
            eq(conversationsTable.userId, req.userId),
          ),
        )
        .limit(1)
        .for("update");
      if (!conversation) return { error: "not_found" as const };
      if (conversation.status === "closed") return { error: "closed" as const };

      const [message] = await tx
        .insert(messagesTable)
        .values({
          conversationId: conversation.id,
          sender: "user",
          content: parsed.data.content,
        })
        .returning();
      const [updatedConversation] = await tx
        .update(conversationsTable)
        .set({ lastActivityAt: new Date() })
        .where(eq(conversationsTable.id, conversation.id))
        .returning();
      return {
        conversation: updatedConversation ?? conversation,
        message,
        error: null,
      };
    });

    if (start.error === "not_found") {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (start.error === "closed") {
      res.status(409).json({ error: "This conversation is already closed." });
      return;
    }
    const conv = start.conversation;
    const userMsg = start.message;

    if (conv.status === "escalated") {
      await db
        .update(conversationsTable)
        .set({ lastActivityAt: new Date() })
        .where(eq(conversationsTable.id, conv.id));
      await markConversationEscalationUnread(conv.id);
      res.json({
        message: toPublicMessage(userMsg),
        response: "",
        stages: [],
        shouldAskResolution: false,
        answerable: false,
        articlesUsed: [],
      });
      return;
    }

    const existingMeta = isPlainObject(conv.metadata) ? conv.metadata : {};
    const storedContext = isPlainObject(existingMeta.context) ? existingMeta.context : {};
    const requestContext: Record<string, unknown> = {
      ...storedContext,
      ...(isPlainObject(parsed.data.context) ? parsed.data.context : {}),
    };
    const existingPerson = isPlainObject(existingMeta.person) ? existingMeta.person : {};
    const emailLookup = resolveUserEmail(req.userId, req.userEmail);
    const appDomain = appDomainAttribute(requestContext.pageDomain);
    const requestName =
      typeof requestContext.name === "string"
        ? requestContext.name
        : typeof requestContext.user_name === "string"
          ? requestContext.user_name
          : null;
    const [
      resolvedEmail,
      conversationSettingsRows,
      userName,
      communicationLanguage,
      history,
    ] = await Promise.all([
      emailLookup,
      conv.agentId
        ? db
            .select()
            .from(agentConversationSettingsTable)
            .where(eq(agentConversationSettingsTable.agentId, conv.agentId))
            .limit(1)
        : Promise.resolve([]),
      requestName ?? resolveUserDisplayName(req.userId, req.userEmail),
      getAgentCommunicationLanguage(conv.agentId),
      db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conv.id))
        .orderBy(messagesTable.createdAt),
    ]);
    const email =
      resolvedEmail ??
      (typeof existingPerson.email === "string" ? existingPerson.email : null);
    const person: PersonAttributes = {
      personType: "user",
      attributes: {
        user_id: req.userId,
        ...(email ? { email } : {}),
        ...requestContext,
        ...(appDomain ? { app_domain: appDomain } : {}),
      },
    };
    const [conversationSettings] = conversationSettingsRows;
    const requestPreparationMs = elapsedMs(requestStartedAt);
    let answered;
    try {
      answered = await answerFromKnowledge({
        message: parsed.data.content,
        history,
        agentId: conv.agentId,
        ...(conv.agentId && req.workspaceMemberId
          ? { caller: { userId: req.userId, agentId: conv.agentId } }
          : {}),
        person,
        context: {
          ...requestContext,
          ...(existingMeta.browser_language != null
            ? { browser_language: existingMeta.browser_language }
            : {}),
          agent_language: communicationLanguage,
        },
        replyLocaleCandidates: [communicationLanguage],
        userName,
        escalationTemplate:
          conversationSettings?.escalationMessage ??
          DEFAULT_CONVERSATION_SETTINGS.escalationMessage,
      });
      answered.stages[0]!.details = {
        ...answered.stages[0]!.details,
        request_preparation_ms: requestPreparationMs,
      };
      if (answered.internalDiagnostics) {
        req.log.info(
          { answer_diagnostics: answered.internalDiagnostics },
          "Support answer diagnostics",
        );
      }
    } catch (error) {
      const message = workflowProviderErrorMessage(error);
      if (message) {
        req.log.warn(
          { diagnostic_code: "provider_request_failed", error: message },
          "Customer response generation failed",
        );
      }
      res.status(503).json({
        error: localizedCommunicationMessage("assistantUnavailable", communicationLanguage),
      });
      return;
    }

    const responseText = answered.responseText;
    const resolutionStatus = answered.resolutionStatus;
    const shouldAskResolution = answered.shouldAskResolution;
    const assistantMetadata = answered.assistantMetadata;
    const stages = answered.stages;
    const persistenceStartedAt = performance.now();

    const [assistantMsg] = await db
      .insert(messagesTable)
      .values({
        conversationId: conv.id,
        sender: "assistant",
        content: responseText,
        metadata: assistantMetadata,
      })
      .returning();

    const nextStatus = nextConversationStatus(resolutionStatus, conv.status);
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

    const latencyMs = elapsedMs(requestStartedAt);
    const [log] = await db
      .insert(orchestratorLogsTable)
      .values({
        conversationId: conv.id,
        messageId: assistantMsg.id,
        articlesUsed: answered.articlesUsed,
        articleIds: answered.articleIds,
        answerable: answered.answerable,
        promptAssembled: answered.promptAssembled,
        tokensUsed: String(answered.totalTokens),
        latencyMs: String(latencyMs),
        llmModel: answered.model,
        resolutionStatus,
      })
      .returning();
    if (nextStatus === "resolved") {
      await updateConversationAnalytics(conv.id);
    }

    stages.push({
      stage: 5,
      name: "Persist Reply",
      status: "completed",
      details: {
        duration_ms: elapsedMs(persistenceStartedAt),
        request_elapsed_ms: elapsedMs(requestStartedAt),
      },
    });
    res.once("finish", () => {
      req.log.info(
        { end_to_end_ms: elapsedMs(requestStartedAt) },
        "Support reply request completed",
      );
    });
    res.json({
      message: toPublicMessage(assistantMsg),
      response: responseText,
      stages,
      shouldAskResolution,
      answerable: answered.answerable,
      articlesUsed: answered.articlesUsed,
      log: toLog(log),
    });
  },
);

// ── Submit feedback ───────────────────────────────────────────────────────
router.post(
  "/conversations/:id/feedback",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SubmitFeedbackParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // Verify ownership
    let [conv] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, params.data.id),
          eq(conversationsTable.userId, req.userId),
        ),
      );
    if (!conv && req.workspaceMemberId) {
      const assigned = await getAssignedConversation(
        params.data.id,
        req.workspaceMemberId,
        req.memberRole,
      );
      if (assigned) conv = { id: assigned.id };
    }
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
      res
        .status(400)
        .json({ error: "Message does not belong to this conversation." });
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
  },
);

// ── Submit NPS after auto-close ───────────────────────────────────────────
router.post(
  "/conversations/:id/nps",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SubmitConversationNpsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = SubmitConversationNpsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const row = await submitConversationNps(
        params.data.id,
        req.userId,
        Math.trunc(parsed.data.score),
      );
      if (!row) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      res.json(toConversation(row));
    } catch (error) {
      if (error instanceof ConversationLifecycleError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

// ── Submit binary conversation rating after an inactivity warning ────────
router.post(
  "/conversations/:id/rating",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SubmitConversationRatingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = SubmitConversationRatingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const row = await submitConversationRating(
        params.data.id,
        req.userId,
        parsed.data.rating,
      );
      if (!row) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      res.json(toConversation(row));
    } catch (error) {
      if (error instanceof ConversationLifecycleError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

// ── List conversation logs ────────────────────────────────────────────────
router.get(
  "/conversations/:id/logs",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListConversationLogsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // Verify ownership before returning logs
    const [conv] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, params.data.id),
          eq(conversationsTable.userId, req.userId),
        ),
      );
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
  },
);

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
    .where(
      inArray(
        messagesTable.conversationId,
        convos.map((c) => c.id),
      ),
    )
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
      const questionType = classifyQuestionType(
        conv.status,
        hasAssistantAfter,
        isLastUser,
      );
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
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      0,
      0,
      0,
      0,
    );
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDayEnd(value?: string): Date | null {
  const start = parseDayStart(value);
  if (!start) return null;
  return new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
    23,
    59,
    59,
    999,
  );
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

type QuestionType = "question" | "unanswered" | "escalated";

function classifyQuestionType(
  conversationStatus: string,
  hasAssistantAfter: boolean,
  isLastUser: boolean,
): QuestionType {
  if (conversationStatus === "escalated" && isLastUser) return "escalated";
  if (!hasAssistantAfter) return "unanswered";
  if (
    isLastUser &&
    conversationStatus !== "resolved" &&
    conversationStatus !== "closed"
  ) {
    return "unanswered";
  }
  return "question";
}

function nextConversationStatus(
  resolutionStatus: string,
  previousStatus: string,
): string {
  if (resolutionStatus === "escalated") return "escalated";
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

function toConversation(row: typeof conversationsTable.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    metadata: row.metadata ?? {},
    lastActivityAt:
      row.lastActivityAt?.toISOString() ?? new Date().toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    agentId: row.agentId ?? null,
    npsScore: row.npsScore ?? null,
    conversationRating: row.conversationRating ?? null,
    conversationRatingAt: row.conversationRatingAt?.toISOString() ?? null,
  };
}

function toLog(row: typeof orchestratorLogsTable.$inferSelect) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId ?? null,
    articlesUsed: row.articlesUsed ?? [],
    articleIds: row.articleIds ?? [],
    answerable: row.answerable,
    promptAssembled: row.promptAssembled,
    tokensUsed: Number(row.tokensUsed),
    latencyMs: Number(row.latencyMs),
    llmModel: row.llmModel,
    resolutionStatus: row.resolutionStatus,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export default router;
