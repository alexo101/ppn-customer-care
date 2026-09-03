import { eq } from "drizzle-orm";
import {
  agentConversationSettingsTable,
  db,
  messagesTable,
} from "@workspace/db";
import { logger } from "./logger";
import {
  DEFAULT_CONVERSATION_SETTINGS,
  isPlainMetadata,
} from "./conversation-auto-close";

export const REQUIRED_WELCOME_TOKENS = ["{user_name}", "{agent_name}"] as const;
export const DEFAULT_AGENT_DISPLAY_NAME = "Support Assistant";

export function hasRequiredWelcomeTokens(message: string): boolean {
  return REQUIRED_WELCOME_TOKENS.every((token) => message.includes(token));
}

export function interpolateWelcomeMessage(
  template: string,
  vars: { userName: string; agentName: string },
): string {
  return template
    .replaceAll("{user_name}", vars.userName)
    .replaceAll("{agent_name}", vars.agentName);
}

export function isTrainingConversation(metadata: unknown): boolean {
  return isPlainMetadata(metadata) && metadata.source === "training";
}

export async function sendWelcomeMessageIfNeeded(input: {
  conversationId: string;
  agentId: string | null;
  metadata: unknown;
  userName: string;
  agentName?: string | null;
}): Promise<void> {
  if (!input.agentId) return;
  if (isTrainingConversation(input.metadata)) return;

  try {
    const [settings] = await db
      .select({ welcomeMessage: agentConversationSettingsTable.welcomeMessage })
      .from(agentConversationSettingsTable)
      .where(eq(agentConversationSettingsTable.agentId, input.agentId))
      .limit(1);
    const template = (
      settings?.welcomeMessage ?? DEFAULT_CONVERSATION_SETTINGS.welcomeMessage
    ).trim();
    if (!template) return;

    const content = interpolateWelcomeMessage(template, {
      userName: input.userName,
      agentName: input.agentName?.trim() || DEFAULT_AGENT_DISPLAY_NAME,
    }).trim();
    if (!content) return;

    await db.insert(messagesTable).values({
      conversationId: input.conversationId,
      sender: "assistant",
      content,
      metadata: { kind: "welcome" },
    });
  } catch (error) {
    logger.error({ error }, "Failed to send welcome message");
  }
}
