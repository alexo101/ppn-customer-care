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
import {
  OpenAIWelcomeMessageTranslator,
  type WelcomeMessageTranslator,
} from "./llm/openai-welcome-message-translator";
import { localizedCommunicationMessage, resolveReplyLocale } from "./reply-locale";
import { getAgentCommunicationLanguage } from "./agent-communication-language";

export const REQUIRED_WELCOME_TOKENS = ["{user_name}", "{agent_name}"] as const;
export const REQUIRED_ESCALATION_TOKENS = ["{user_name}"] as const;
export const DEFAULT_AGENT_DISPLAY_NAME = "Support Assistant";

export function hasRequiredWelcomeTokens(message: string): boolean {
  return REQUIRED_WELCOME_TOKENS.every((token) => message.includes(token));
}

export function hasRequiredEscalationTokens(message: string): boolean {
  return REQUIRED_ESCALATION_TOKENS.every((token) => message.includes(token));
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

export function normalizeBrowserLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized)
    ? normalized
    : null;
}

const translatedWelcomeMessages = new Map<string, string>();
let defaultWelcomeMessageTranslator: WelcomeMessageTranslator | undefined;

export async function translateWelcomeTemplate(
  template: string,
  agentLanguage: unknown,
  translator?: WelcomeMessageTranslator,
): Promise<string> {
  const locale = resolveReplyLocale(agentLanguage);
  const fallback = localizedCommunicationMessage("welcome", locale);
  const translated = await translateCustomerTemplate(template, locale, fallback, translator);
  return hasRequiredWelcomeTokens(translated)
    ? translated
    : fallback;
}

export async function translateCustomerTemplate(
  template: string,
  agentLanguage: unknown,
  fallback: string,
  translator?: WelcomeMessageTranslator,
): Promise<string> {
  const locale = resolveReplyLocale(agentLanguage);
  if (!template.trim()) return fallback;
  if (locale === "en") return template;
  const cacheKey = `${locale}\u0000${template}`;
  const cached = translatedWelcomeMessages.get(cacheKey);
  if (cached) return cached;
  try {
    const activeTranslator =
      translator ??
      (defaultWelcomeMessageTranslator ??=
        new OpenAIWelcomeMessageTranslator());
    const translated = await activeTranslator.translate(template, locale);
    const placeholders = [...new Set(template.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])];
    if (!translated.trim() || placeholders.some((placeholder) => !translated.includes(placeholder))) {
      throw new Error("Translated customer message is invalid.");
    }
    translatedWelcomeMessages.set(cacheKey, translated);
    return translated;
  } catch (error) {
    logger.warn(
      { err: error, locale },
      "Failed to translate customer message; using localized default",
    );
    return fallback;
  }
}

export async function sendWelcomeMessageIfNeeded(input: {
  conversationId: string;
  agentId: string | null;
  metadata: unknown;
  userName: string;
  agentName?: string | null;
  translator?: WelcomeMessageTranslator;
}): Promise<void> {
  if (!input.agentId) return;

  try {
    const [settings] = await db
      .select({ welcomeMessage: agentConversationSettingsTable.welcomeMessage })
      .from(agentConversationSettingsTable)
      .where(eq(agentConversationSettingsTable.agentId, input.agentId))
      .limit(1);
    const agentLanguage = await getAgentCommunicationLanguage(input.agentId);
    const template = (
      settings?.welcomeMessage ?? DEFAULT_CONVERSATION_SETTINGS.welcomeMessage
    ).trim();
    if (!template) return;

    const localizedTemplate = await translateWelcomeTemplate(
      template,
      agentLanguage,
      input.translator,
    );
    const content = interpolateWelcomeMessage(localizedTemplate, {
      userName: input.userName,
      agentName: input.agentName?.trim() || DEFAULT_AGENT_DISPLAY_NAME,
    }).trim();
    if (!content) return;

    await db.insert(messagesTable).values({
      conversationId: input.conversationId,
      sender: "assistant",
      content,
      metadata: {
        kind: "welcome",
        ...(isPlainMetadata(input.metadata) &&
        normalizeBrowserLanguage(input.metadata.browser_language)
          ? { browser_language: normalizeBrowserLanguage(input.metadata.browser_language) }
          : {}),
        communication_language: agentLanguage,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to send welcome message");
  }
}
