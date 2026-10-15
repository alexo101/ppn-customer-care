import { and, desc, eq } from "drizzle-orm";
import {
  conversationAnalyticsTable,
  conversationFeedbackTable,
  conversationsTable,
  messagesTable,
  orchestratorLogsTable,
  db,
} from "@workspace/db";

const COST_PER_TOKEN: Record<string, number> = {
  "gpt-5-nano": 0.0000001,
  "text-embedding-3-small": 0.00000002,
  "text-embedding-ada-002": 0.0000001,
  "text-embedding-3-large": 0.00000013,
};
const DEFAULT_COST_PER_TOKEN = 0.000001;

export async function updateConversationAnalytics(conversationId: string): Promise<void> {
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);
  if (!conversation || !["resolved", "closed"].includes(conversation.status)) return;

  const [logs, messages, feedback] = await Promise.all([
    db.select().from(orchestratorLogsTable).where(eq(orchestratorLogsTable.conversationId, conversationId)),
    db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, conversationId),
          eq(messagesTable.sender, "user"),
        ),
      ),
    db
      .select({ rating: conversationFeedbackTable.rating })
      .from(conversationFeedbackTable)
      .where(eq(conversationFeedbackTable.conversationId, conversationId))
      .orderBy(desc(conversationFeedbackTable.createdAt))
      .limit(1),
  ]);
  const articlesUsed = [...new Set(logs.flatMap((log) => log.articlesUsed ?? []))];
  const totalTokens = logs.reduce((sum, log) => sum + Number(log.tokensUsed || 0), 0);
  const estimatedCostUsd = logs.reduce((sum, log) => {
    const models = log.llmModel.split(",").map((model) => model.trim()).filter(Boolean);
    const perToken = models.length
      ? models.reduce((cost, model) => cost + (COST_PER_TOKEN[model] ?? DEFAULT_COST_PER_TOKEN), 0) / models.length
      : DEFAULT_COST_PER_TOKEN;
    return sum + Number(log.tokensUsed || 0) * perToken;
  }, 0);
  const resolvedAt = conversation.resolvedAt ?? new Date();
  const resolutionTimeMs = Math.max(0, resolvedAt.getTime() - conversation.createdAt.getTime());

  await db
    .insert(conversationAnalyticsTable)
    .values({
      conversationId,
      resolutionStatus: conversation.status,
      resolutionTimeMs,
      interactionCount: messages.length,
      articlesUsed,
      totalTokens,
      estimatedCostUsd: estimatedCostUsd.toFixed(8),
      feedbackRating: feedback[0]?.rating ?? null,
    })
    .onConflictDoUpdate({
      target: conversationAnalyticsTable.conversationId,
      set: {
        resolutionStatus: conversation.status,
        resolutionTimeMs,
        interactionCount: messages.length,
        articlesUsed,
        totalTokens,
        estimatedCostUsd: estimatedCostUsd.toFixed(8),
        feedbackRating: feedback[0]?.rating ?? null,
        updatedAt: new Date(),
      },
    });
}
