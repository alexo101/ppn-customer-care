export const DEFAULT_WELCOME_MESSAGE =
  "Hello {user_name}, you are speaking {agent_name} Ai Agent. How can I help you?";
export const DEFAULT_ESCALATION_MESSAGE =
  "Sorry {user_name}, I'm not able to answer this message. I can escalate this question, or you can ask another question.";
export const DEFAULT_WARNING_MESSAGE =
  "This conversation is still open. If you need more help, reply here; otherwise, it will close after the configured idle period.";

export type ConversationSettingsValues = {
  warningAfterMinutes: number;
  warningMessage: string;
  autoCloseAfterMinutes: number;
  autoCloseMessage: string;
  welcomeMessage: string;
  escalationMessage: string;
};

export const DEFAULT_CONVERSATION_SETTINGS: ConversationSettingsValues = {
  warningAfterMinutes: 0,
  warningMessage: "",
  autoCloseAfterMinutes: 60,
  autoCloseMessage: "",
  welcomeMessage: DEFAULT_WELCOME_MESSAGE,
  escalationMessage: DEFAULT_ESCALATION_MESSAGE,
};

export type InactivityAction = "skip" | "warn" | "close";

export function inactivityDurationMs(minutes: number): number {
  return Math.max(0, Math.trunc(minutes)) * 60 * 1000;
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
  delete next.inactivityWarningFor;
  return {
    ...next,
    autoClosed: true,
    autoCloseFeedback: true,
  };
}

export function hasAutoCloseFeedback(metadata: unknown): boolean {
  return isPlainMetadata(metadata) && metadata.autoCloseFeedback === true;
}

export function npsSubmitError(
  conversation: {
    status: string;
    npsScore: number | null;
    metadata: unknown;
  } | null,
): string | null {
  if (!conversation) return null;
  if (conversation.status !== "closed") {
    return "NPS can only be submitted after the conversation is closed.";
  }
  if (!isAutoClosed(conversation.metadata)) {
    return "NPS is only available after an automatic close.";
  }
  if (hasAutoCloseFeedback(conversation.metadata)) {
    return "NPS is not available for conversations using thumbs feedback.";
  }
  if (conversation.npsScore != null) {
    return "NPS has already been submitted.";
  }
  return null;
}

export function nextInactivityAction(input: {
  status: string;
  lastActivityAt: Date;
  settings: ConversationSettingsValues | null;
  warningForLastActivityAt?: string | null;
  now?: Date;
}): InactivityAction {
  if (input.status === "closed" || input.status === "escalated") return "skip";
  const settings = input.settings ?? DEFAULT_CONVERSATION_SETTINGS;
  const now = input.now ?? new Date();
  const elapsed = now.getTime() - input.lastActivityAt.getTime();
  const closeDurationMs = inactivityDurationMs(settings.autoCloseAfterMinutes);
  if (closeDurationMs > 0 && elapsed >= closeDurationMs) return "close";
  const warningDurationMs = inactivityDurationMs(settings.warningAfterMinutes);
  if (
    warningDurationMs > 0 &&
    elapsed >= warningDurationMs &&
    input.warningForLastActivityAt !== input.lastActivityAt.toISOString()
  ) {
    return "warn";
  }
  return "skip";
}

export function isValidInactivitySettings(
  settings: Pick<
    ConversationSettingsValues,
    "warningAfterMinutes" | "autoCloseAfterMinutes"
  >,
): boolean {
  const maximum = 527_039;
  if (
    !Number.isInteger(settings.warningAfterMinutes) ||
    !Number.isInteger(settings.autoCloseAfterMinutes) ||
    settings.warningAfterMinutes < 0 ||
    settings.autoCloseAfterMinutes < 0 ||
    settings.warningAfterMinutes > maximum ||
    settings.autoCloseAfterMinutes > maximum
  ) {
    return false;
  }
  return (
    settings.warningAfterMinutes <= 0 ||
    settings.autoCloseAfterMinutes <= 0 ||
    settings.autoCloseAfterMinutes > settings.warningAfterMinutes
  );
}
