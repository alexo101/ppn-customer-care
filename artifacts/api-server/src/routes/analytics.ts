import { Router, type IRouter } from "express";
import { sql, desc, eq } from "drizzle-orm";
import { db, orchestratorLogsTable, conversationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { ListAnalyticsLogsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId;
  const { rows: convRows } = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_conversations,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active_conversations,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_conversations,
      COUNT(*) FILTER (WHERE status = 'escalated')::int AS escalated_conversations
    FROM conversations
    WHERE user_id = ${userId}
  `);

  const { rows: msgRows } = await db.execute(sql`
    SELECT COUNT(*)::int AS total_messages
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ${userId}
  `);

  const { rows: feedbackRows } = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE cf.rating = 'positive')::int AS positive_ratings,
      COUNT(*) FILTER (WHERE cf.rating = 'negative')::int AS negative_ratings
    FROM conversation_feedback cf
    JOIN conversations c ON c.id = cf.conversation_id
    WHERE c.user_id = ${userId}
  `);

  const { rows: logRows } = await db.execute(sql`
    SELECT AVG(ol.confidence_score::numeric)::float AS avg_confidence
    FROM orchestrator_logs ol
    JOIN conversations c ON c.id = ol.conversation_id
    WHERE c.user_id = ${userId}
  `);

  const r = (convRows[0] ?? {}) as Record<string, unknown>;
  const m = (msgRows[0] ?? {}) as Record<string, unknown>;
  const f = (feedbackRows[0] ?? {}) as Record<string, unknown>;
  const l = (logRows[0] ?? {}) as Record<string, unknown>;

  res.json({
    totalConversations: Number(r.total_conversations ?? 0),
    activeConversations: Number(r.active_conversations ?? 0),
    resolvedConversations: Number(r.resolved_conversations ?? 0),
    escalatedConversations: Number(r.escalated_conversations ?? 0),
    avgConfidenceScore: l.avg_confidence != null ? Math.round(Number(l.avg_confidence) * 100) / 100 : 0,
    totalMessages: Number(m.total_messages ?? 0),
    positiveRatings: Number(f.positive_ratings ?? 0),
    negativeRatings: Number(f.negative_ratings ?? 0),
  });
});

router.get("/analytics/logs", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListAnalyticsLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const limit = Math.min((parsed.data.limit as number) ?? 100, 500);
  const userId = req.userId;

  // Scope logs to conversations owned by the authenticated user
  const rows = await db
    .select({ log: orchestratorLogsTable })
    .from(orchestratorLogsTable)
    .innerJoin(conversationsTable, eq(orchestratorLogsTable.conversationId, conversationsTable.id))
    .where(eq(conversationsTable.userId, userId))
    .orderBy(desc(orchestratorLogsTable.createdAt))
    .limit(limit);

  res.json(
    rows.map(({ log: row }) => ({
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
    })),
  );
});

export default router;
