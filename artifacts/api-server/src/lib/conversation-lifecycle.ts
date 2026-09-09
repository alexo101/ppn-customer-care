import { and, eq, ne } from "drizzle-orm";
import {
  agentConversationSettingsTable,
  conversationsTable,
  db,
  messagesTable,
  type Conversation,
} from "@workspace/db";
import { logger } from "./logger";
import { updateConversationAnalytics } from "./conversation-analytics";
import {
  DEFAULT_CONVERSATION_SETTINGS,
  isPlainMetadata,
  nextAutoCloseAction,
  npsSubmitError,
  withAutoClosed,
} from "./conversation-auto-close";

export { nextAutoCloseAction, npsSubmitError } from "./conversation-auto-close";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export class ConversationLifecycleError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ConversationLifecycleError";
    this.statusCode = statusCode;
  }
}

async function insertAssistantMessage(
  conversationId: string,
  content: string,
  metadata: Record<string, unknown> = {},
) {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const [row] = await db
    .insert(messagesTable)
    .values({
      conversationId,
      sender: "assistant",
      content: trimmed,
      metadata,
    })
    .returning();
  return row ?? null;
}

async function closeConversation(
  conversation: Conversation,
  closingMessage: string,
  now: Date,
) {
  if (closingMessage.trim()) {
    await insertAssistantMessage(conversation.id, closingMessage, {
      kind: "auto_close",
    });
  }
  const metadata = withAutoClosed(
    isPlainMetadata(conversation.metadata) ? conversation.metadata : {},
  );
  await db
    .update(conversationsTable)
    .set({
      status: "closed",
      resolvedAt: now,
      lastActivityAt: now,
      metadata,
    })
    .where(eq(conversationsTable.id, conversation.id));
  await updateConversationAnalytics(conversation.id);
}

export async function closeInactiveConversations(
  now = new Date(),
): Promise<{ closed: number }> {
  const rows = await db
    .select({
      conversation: conversationsTable,
      settings: agentConversationSettingsTable,
    })
    .from(conversationsTable)
    .leftJoin(
      agentConversationSettingsTable,
      eq(conversationsTable.agentId, agentConversationSettingsTable.agentId),
    )
    .where(
      and(
        ne(conversationsTable.status, "closed"),
        ne(conversationsTable.status, "escalated"),
      ),
    );

  let closed = 0;
  for (const row of rows) {
    const settings = row.settings
      ? {
          autoCloseDays: row.settings.autoCloseDays,
          autoCloseHours: row.settings.autoCloseHours,
          autoCloseMinutes: row.settings.autoCloseMinutes,
          closingMessage: row.settings.closingMessage,
          welcomeMessage: row.settings.welcomeMessage,
          escalationMessage: row.settings.escalationMessage,
        }
      : DEFAULT_CONVERSATION_SETTINGS;
    const action = nextAutoCloseAction({
      status: row.conversation.status,
      lastActivityAt: row.conversation.lastActivityAt,
      settings,
      now,
    });
    if (action === "close") {
      await closeConversation(row.conversation, settings.closingMessage, now);
      closed += 1;
    }
  }
  return { closed };
}

export async function submitConversationNps(
  conversationId: string,
  userId: string,
  score: number,
): Promise<Conversation | null> {
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        eq(conversationsTable.userId, userId),
      ),
    )
    .limit(1);
  if (!conversation) return null;

  const error = npsSubmitError({
    status: conversation.status,
    npsScore: conversation.npsScore,
    metadata: conversation.metadata,
  });
  if (error) {
    throw new ConversationLifecycleError(error);
  }

  const [updated] = await db
    .update(conversationsTable)
    .set({ npsScore: score })
    .where(eq(conversationsTable.id, conversation.id))
    .returning();
  return updated ?? conversation;
}

export function startConversationLifecycleSweep(): NodeJS.Timeout | null {
  if (process.env.NODE_ENV === "test") return null;
  const sweep = async () => {
    try {
      const { closed } = await closeInactiveConversations();
      if (closed > 0) {
        logger.info({ closed }, "Processed inactive conversations");
      }
    } catch (error) {
      logger.error({ error }, "Failed to close inactive conversations");
    }
  };
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
