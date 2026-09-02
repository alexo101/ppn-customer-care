export type ConversationSettingsValues = {
  autoCloseDays: number;
  autoCloseHours: number;
  autoCloseMinutes: number;
  closingMessage: string;
  askIfResolved: boolean;
};

export const DEFAULT_CONVERSATION_SETTINGS: ConversationSettingsValues = {
  autoCloseDays: 0,
  autoCloseHours: 1,
  autoCloseMinutes: 0,
  closingMessage: "",
  askIfResolved: true,
};

export type AutoCloseAction = "skip" | "prompt" | "close";

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

export function isAwaitingAutoCloseConfirmation(metadata: unknown): boolean {
  return (
    isPlainMetadata(metadata) && metadata.awaitingAutoCloseConfirmation === true
  );
}

export function clearAutoCloseConfirmation(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...metadata };
  delete next.awaitingAutoCloseConfirmation;
  delete next.autoClosePromptedAt;
  return next;
}

export function withAutoCloseConfirmation(
  metadata: Record<string, unknown>,
  now: Date,
): Record<string, unknown> {
  return {
    ...metadata,
    awaitingAutoCloseConfirmation: true,
    autoClosePromptedAt: now.toISOString(),
  };
}

export function nextAutoCloseAction(input: {
  status: string;
  lastActivityAt: Date;
  metadata: unknown;
  settings: ConversationSettingsValues | null;
  now?: Date;
}): AutoCloseAction {
  if (input.status === "closed" || input.status === "escalated") return "skip";
  const settings = input.settings ?? DEFAULT_CONVERSATION_SETTINGS;
  const durationMs = autoCloseDurationMs(settings);
  if (durationMs <= 0) return "skip";
  const now = input.now ?? new Date();
  if (now.getTime() - input.lastActivityAt.getTime() < durationMs) return "skip";
  if (settings.askIfResolved && !isAwaitingAutoCloseConfirmation(input.metadata)) {
    return "prompt";
  }
  return "close";
}
