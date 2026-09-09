import { logger } from "./logger";
import {
  OpenAIWelcomeMessageTranslator,
  type WelcomeMessageTranslator,
} from "./llm/openai-welcome-message-translator";
import { normalizeBrowserLanguage } from "./welcome-message";

export const UNABLE_TO_ANSWER_MESSAGE_KIND = "unable_to_answer";
export const ESCALATE_MESSAGE_ACTION = "escalate";

export function interpolateEscalationMessage(
  template: string,
  userName: string,
): string {
  return template.replaceAll("{user_name}", userName.trim() || "there").trim();
}

export async function translateEscalationTemplate(
  template: string,
  replyLanguageCandidates: unknown[],
  translator?: WelcomeMessageTranslator,
): Promise<string> {
  const locale = replyLanguageCandidates
    .map(normalizeBrowserLanguage)
    .find((candidate): candidate is string => Boolean(candidate));
  if (!locale) return template;

  try {
    const translated = await (
      translator ??
      new OpenAIWelcomeMessageTranslator()
    ).translate(template, locale);
    if (!translated.trim() || !translated.includes("{user_name}")) {
      throw new Error("Translated escalation message lost the user placeholder.");
    }
    return translated;
  } catch (error) {
    logger.warn(
      { err: error, locale },
      "Failed to translate escalation message; using configured template",
    );
    return template;
  }
}

export function buildUnableToAnswerResponse(
  template: string,
  userName: string,
) {
  return {
    responseText: interpolateEscalationMessage(template, userName),
    metadata: {
      citations: [],
      kind: UNABLE_TO_ANSWER_MESSAGE_KIND,
      actions: [ESCALATE_MESSAGE_ACTION],
    },
    resolutionStatus: "pending_clarification",
    shouldAskResolution: false,
  } as const;
}

export function isUnableToAnswerMessageMetadata(
  metadata: unknown,
): metadata is {
  kind: typeof UNABLE_TO_ANSWER_MESSAGE_KIND;
  actions: string[];
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  const value = metadata as { kind?: unknown; actions?: unknown };
  return (
    value.kind === UNABLE_TO_ANSWER_MESSAGE_KIND &&
    Array.isArray(value.actions) &&
    value.actions.includes(ESCALATE_MESSAGE_ACTION)
  );
}
