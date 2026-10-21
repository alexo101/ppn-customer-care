import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  agentConversationSettingsTable,
  appearanceSettingsTable,
  conversationsTable,
  db,
  messagesTable,
  type Conversation,
} from "@workspace/db";
import { logger } from "./logger";
import { updateConversationAnalytics } from "./conversation-analytics";
import {
  DEFAULT_CONVERSATION_SETTINGS,
  hasAutoCloseFeedback,
  isAutoClosed,
  isPlainMetadata,
  nextInactivityAction,
  npsSubmitError,
  withAutoClosed,
  type ConversationSettingsValues,
} from "./conversation-auto-close";
import { translateCustomerTemplate } from "./welcome-message";
import { localizedCommunicationMessage, resolveReplyLocale } from "./reply-locale";

export {
  nextInactivityAction,
  npsSubmitError,
} from "./conversation-auto-close";

const SWEEP_INTERVAL_MS = 30 * 1000;
const NEW_AUTO_CLOSE_FLOW = "warning_rating_v1";

export class ConversationLifecycleError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ConversationLifecycleError";
    this.statusCode = statusCode;
  }
}

function conversationSettings(
  row: typeof agentConversationSettingsTable.$inferSelect | null | undefined,
): ConversationSettingsValues {
  if (!row) return DEFAULT_CONVERSATION_SETTINGS;
  return {
    warningAfterMinutes: row.warningAfterMinutes,
    warningMessage: row.warningMessage,
    autoCloseAfterMinutes: row.autoCloseAfterMinutes,
    autoCloseMessage: row.autoCloseMessage,
    welcomeMessage: row.welcomeMessage,
    escalationMessage: row.escalationMessage,
  };
}

function warningForLastActivityAt(metadata: unknown): string | null {
  if (!isPlainMetadata(metadata)) return null;
  return typeof metadata.inactivityWarningFor === "string"
    ? metadata.inactivityWarningFor
    : null;
}

async function insertAssistantMessage(
  executor: Pick<typeof db, "insert">,
  conversationId: string,
  content: string,
  kind: string,
) {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const [row] = await executor
    .insert(messagesTable)
    .values({
      conversationId,
      sender: "assistant",
      content: trimmed,
      metadata: { kind },
    })
    .returning();
  return row ?? null;
}

export async function translateWarningMessage(
  template: string,
  language: unknown,
): Promise<string> {
  const locale = resolveReplyLocale(language);
  return translateCustomerTemplate(
    template,
    locale,
    localizedCommunicationMessage("inactivityWarning", locale),
  );
}

export async function translateClosingMessage(
  template: string,
  language: unknown,
): Promise<string> {
  const locale = resolveReplyLocale(language);
  return translateCustomerTemplate(
    template,
    locale,
    localizedCommunicationMessage("closing", locale),
  );
}

export async function closeInactiveConversations(
  now = new Date(),
): Promise<{ warned: number; closed: number }> {
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

  const agentIds = [
    ...new Set(
      rows
        .map((row) => row.conversation.agentId)
        .filter((agentId): agentId is string => Boolean(agentId)),
    ),
  ];
  const appearanceRows = agentIds.length
    ? await db
        .select({
          agentId: appearanceSettingsTable.agentId,
          language: appearanceSettingsTable.communicationLanguage,
        })
        .from(appearanceSettingsTable)
        .where(inArray(appearanceSettingsTable.agentId, agentIds))
        .orderBy(
          desc(appearanceSettingsTable.updatedAt),
          desc(appearanceSettingsTable.createdAt),
          desc(appearanceSettingsTable.id),
        )
    : [];
  const languageByAgent = new Map<string, string>();
  for (const appearance of appearanceRows) {
    if (appearance.agentId && !languageByAgent.has(appearance.agentId)) {
      languageByAgent.set(appearance.agentId, appearance.language);
    }
  }

  let warned = 0;
  let closed = 0;
  for (const row of rows) {
    const settings = conversationSettings(row.settings);
    const conversation = row.conversation;
    const initialAction = nextInactivityAction({
      status: conversation.status,
      lastActivityAt: conversation.lastActivityAt,
      settings,
      warningForLastActivityAt: warningForLastActivityAt(
        conversation.metadata,
      ),
      now,
    });
    if (initialAction === "skip") continue;

    const language = resolveReplyLocale(
      conversation.agentId
        ? languageByAgent.get(conversation.agentId)
        : undefined,
    );
    // Prepare both messages before locking the conversation. Time may cross
    // from the warning threshold to the close threshold while a sweep runs.
    const [warningMessage, closingMessage] = await Promise.all([
      translateWarningMessage(settings.warningMessage, language),
      translateClosingMessage(settings.autoCloseMessage, language),
    ]);

    const result = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.id, conversation.id))
        .limit(1)
        .for("update");
      if (!locked) return "skip" as const;

      const action = nextInactivityAction({
        status: locked.status,
        lastActivityAt: locked.lastActivityAt,
        settings,
        warningForLastActivityAt: warningForLastActivityAt(locked.metadata),
        now,
      });
      if (action === "skip") return "skip" as const;

      const metadata = isPlainMetadata(locked.metadata)
        ? locked.metadata
        : {};
      if (action === "warn") {
        await insertAssistantMessage(
          tx,
          locked.id,
          warningMessage,
          "inactivity_warning",
        );
        await tx
          .update(conversationsTable)
          .set({
            metadata: {
              ...metadata,
              inactivityWarningFor: locked.lastActivityAt.toISOString(),
            },
          })
          .where(eq(conversationsTable.id, locked.id));
        return "warn" as const;
      }

      await insertAssistantMessage(
        tx,
        locked.id,
        closingMessage,
        "auto_close",
      );
      const nextMetadata = withAutoClosed(metadata);
      await tx
        .update(conversationsTable)
        .set({
          status: "closed",
          resolvedAt: now,
          lastActivityAt: now,
          metadata: { ...nextMetadata, autoCloseFlow: NEW_AUTO_CLOSE_FLOW },
        })
        .where(eq(conversationsTable.id, locked.id));
      return "close" as const;
    });

    if (result === "warn") warned += 1;
    if (result === "close") {
      closed += 1;
      await updateConversationAnalytics(conversation.id);
    }
  }
  return { warned, closed };
}

export function conversationRatingSubmitError(
  conversation: {
    status: string;
    metadata: unknown;
    conversationRating: string | null;
  } | null,
): string | null {
  if (!conversation) return null;
  if (conversation.status !== "closed") {
    return "A conversation can only be rated after it closes.";
  }
  if (
    !isAutoClosed(conversation.metadata) ||
    !hasAutoCloseFeedback(conversation.metadata)
  ) {
    return "Conversation ratings are only available after an automatic close.";
  }
  if (conversation.conversationRating != null) {
    return "A rating has already been submitted.";
  }
  return null;
}

export async function submitConversationRating(
  conversationId: string,
  userId: string,
  rating: "positive" | "negative",
): Promise<Conversation | null> {
  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.userId, userId),
        ),
      )
      .limit(1)
      .for("update");
    if (!conversation) return null;

    const error = conversationRatingSubmitError({
      status: conversation.status,
      metadata: conversation.metadata,
      conversationRating: conversation.conversationRating,
    });
    if (error) throw new ConversationLifecycleError(error);

    const [updated] = await tx
      .update(conversationsTable)
      .set({ conversationRating: rating, conversationRatingAt: new Date() })
      .where(eq(conversationsTable.id, conversation.id))
      .returning();
    return updated ?? conversation;
  });
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
  if (error) throw new ConversationLifecycleError(error);

  const [updated] = await db
    .update(conversationsTable)
    .set({ npsScore: score })
    .where(eq(conversationsTable.id, conversation.id))
    .returning();
  return updated ?? conversation;
}

export function startConversationLifecycleSweep(): NodeJS.Timeout | null {
  if (process.env.NODE_ENV === "test") return null;
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const { warned, closed } = await closeInactiveConversations();
      if (warned > 0 || closed > 0) {
        logger.info(
          { warned, closed },
          "Processed inactive conversation stages",
        );
      }
    } catch (error) {
      logger.error({ error }, "Failed to process inactive conversations");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
