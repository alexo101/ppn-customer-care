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
import { DEFAULT_CONVERSATION_SETTINGS } from "./conversation-auto-close";
import {
  clearAutoCloseConfirmation,
  isPlainMetadata,
  isAwaitingAutoCloseConfirmation,
  nextAutoCloseAction,
  withAutoCloseConfirmation,
} from "./conversation-auto-close";

export {
  clearAutoCloseConfirmation,
  isAwaitingAutoCloseConfirmation,
  nextAutoCloseAction,
  withAutoCloseConfirmation,
} from "./conversation-auto-close";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export class ConversationLifecycleError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ConversationLifecycleError";
    this.statusCode = statusCode;
  }
}

export const AUTO_CLOSE_RESOLUTION_PROMPT =
  "Has your issue been resolved? Let us know if you still need help.";

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
  const metadata = isPlainMetadata(conversation.metadata)
    ? clearAutoCloseConfirmation(conversation.metadata)
    : {};
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

async function promptForResolution(conversation: Conversation, now: Date) {
  await insertAssistantMessage(conversation.id, AUTO_CLOSE_RESOLUTION_PROMPT, {
    kind: "auto_close_prompt",
  });
  const metadata = withAutoCloseConfirmation(
    isPlainMetadata(conversation.metadata) ? conversation.metadata : {},
    now,
  );
  await db
    .update(conversationsTable)
    .set({
      lastActivityAt: now,
      metadata,
    })
    .where(eq(conversationsTable.id, conversation.id));
}

export async function closeInactiveConversations(
  now = new Date(),
): Promise<{ prompted: number; closed: number }> {
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

  let prompted = 0;
  let closed = 0;
  for (const row of rows) {
    const settings = row.settings
      ? {
          autoCloseDays: row.settings.autoCloseDays,
          autoCloseHours: row.settings.autoCloseHours,
          autoCloseMinutes: row.settings.autoCloseMinutes,
          closingMessage: row.settings.closingMessage,
          askIfResolved: row.settings.askIfResolved,
        }
      : DEFAULT_CONVERSATION_SETTINGS;
    const action = nextAutoCloseAction({
      status: row.conversation.status,
      lastActivityAt: row.conversation.lastActivityAt,
      metadata: row.conversation.metadata,
      settings,
      now,
    });
    if (action === "prompt") {
      await promptForResolution(row.conversation, now);
      prompted += 1;
    } else if (action === "close") {
      await closeConversation(row.conversation, settings.closingMessage, now);
      closed += 1;
    }
  }
  return { prompted, closed };
}

export async function applyConversationCloseConfirmation(
  conversationId: string,
  userId: string,
  resolved: boolean,
  now = new Date(),
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
  if (conversation.status === "closed") {
    throw new ConversationLifecycleError("Conversation is already closed.");
  }
  if (!isAwaitingAutoCloseConfirmation(conversation.metadata)) {
    throw new ConversationLifecycleError(
      "This conversation is not waiting for a close confirmation.",
    );
  }

  if (!resolved) {
    const metadata = clearAutoCloseConfirmation(
      isPlainMetadata(conversation.metadata) ? conversation.metadata : {},
    );
    const [updated] = await db
      .update(conversationsTable)
      .set({
        status: "active",
        lastActivityAt: now,
        metadata,
      })
      .where(eq(conversationsTable.id, conversation.id))
      .returning();
    return updated ?? conversation;
  }

  let closingMessage = DEFAULT_CONVERSATION_SETTINGS.closingMessage;
  if (conversation.agentId) {
    const [settings] = await db
      .select()
      .from(agentConversationSettingsTable)
      .where(eq(agentConversationSettingsTable.agentId, conversation.agentId))
      .limit(1);
    if (settings) closingMessage = settings.closingMessage;
  }
  await closeConversation(conversation, closingMessage, now);
  const [updated] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversation.id))
    .limit(1);
  return updated ?? conversation;
}

export function startConversationLifecycleSweep(): NodeJS.Timeout | null {
  if (process.env.NODE_ENV === "test") return null;
  const sweep = async () => {
    try {
      const { prompted, closed } = await closeInactiveConversations();
      if (prompted > 0 || closed > 0) {
        logger.info({ prompted, closed }, "Processed inactive conversations");
      }
    } catch (error) {
      logger.error({ error }, "Failed to close inactive conversations");
    }
  };
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
