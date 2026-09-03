export const DEFAULT_WELCOME_MESSAGE =
  "Hello {user_name}, you are speaking {agent_name} Ai Agent. How can I help you?";

export type ConversationSettingsValues = {
  autoCloseDays: number;
  autoCloseHours: number;
  autoCloseMinutes: number;
  closingMessage: string;
  welcomeMessage: string;
};

export const DEFAULT_CONVERSATION_SETTINGS: ConversationSettingsValues = {
  autoCloseDays: 0,
  autoCloseHours: 1,
  autoCloseMinutes: 0,
  closingMessage: "",
  welcomeMessage: DEFAULT_WELCOME_MESSAGE,
};

export type AutoCloseAction = "skip" | "close";

export function autoCloseDurationMs(settings: ConversationSettingsValues): number {
  return (
    ((settings.autoCloseDays * 24 + settings.autoCloseHours) * 60 +
      settings.autoCloseMinutes) *
    60 *
    1000
  );
}

export function isPlainMetadata(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isAutoClosed(metadata: unknown): boolean {
  return isPlainMetadata(metadata) && metadata.autoClosed === true;
}

export function withAutoClosed(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...metadata };
  delete next.awaitingAutoCloseConfirmation;
  delete next.autoClosePromptedAt;
  return {
    ...next,
    autoClosed: true,
  };
}

export function npsSubmitError(conversation: {
  status: string;
  npsScore: number | null;
  metadata: unknown;
} | null): string | null {
  if (!conversation) return null;
  if (conversation.status !== "closed") {
    return "NPS can only be submitted after the conversation is closed.";
  }
  if (!isAutoClosed(conversation.metadata)) {
    return "NPS is only available after an automatic close.";
  }
  if (conversation.npsScore != null) {
    return "NPS has already been submitted.";
  }
  return null;
}

export function nextAutoCloseAction(input: {
  status: string;
  lastActivityAt: Date;
  settings: ConversationSettingsValues | null;
  now?: Date;
}): AutoCloseAction {
  if (input.status === "closed" || input.status === "escalated") return "skip";
  const settings = input.settings ?? DEFAULT_CONVERSATION_SETTINGS;
  const durationMs = autoCloseDurationMs(settings);
  if (durationMs <= 0) return "skip";
  const now = input.now ?? new Date();
  if (now.getTime() - input.lastActivityAt.getTime() < durationMs) return "skip";
  return "close";
}
