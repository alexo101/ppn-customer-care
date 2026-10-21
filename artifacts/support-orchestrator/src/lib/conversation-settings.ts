export const MAX_AUTO_CLOSE_MINUTES = (365 * 24 + 23) * 60 + 59;

export function toAutoCloseTotalMinutes(
  days: number,
  hours: number,
  minutes: number,
): number {
  return (days * 24 + hours) * 60 + minutes;
}

export function splitAutoCloseTotalMinutes(totalMinutes: number): {
  autoCloseDays: number;
  autoCloseHours: number;
  autoCloseMinutes: number;
} {
  const safeTotal = Number.isFinite(totalMinutes)
    ? Math.min(MAX_AUTO_CLOSE_MINUTES, Math.max(0, Math.trunc(totalMinutes)))
    : 0;
  const autoCloseDays = Math.floor(safeTotal / (24 * 60));
  const remainingMinutes = safeTotal % (24 * 60);
  return {
    autoCloseDays,
    autoCloseHours: Math.floor(remainingMinutes / 60),
    autoCloseMinutes: remainingMinutes % 60,
  };
}

export function isAutoClosedConversation(metadata: unknown): boolean {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as { autoClosed?: unknown }).autoClosed === true,
  );
}

export function hasAutoCloseConversationRating(metadata: unknown): boolean {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as { autoCloseFeedback?: unknown }).autoCloseFeedback === true,
  );
}

export function hasInactivityWarning(metadata: unknown): boolean {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      typeof (metadata as { inactivityWarningFor?: unknown })
        .inactivityWarningFor === "string" &&
      (metadata as { inactivityWarningFor: string }).inactivityWarningFor
        .length > 0,
  );
}

export function latestInactivityWarningMessageId(
  messages: Array<{ id: string; metadata: unknown }>,
): string | null {
  let latestId: string | null = null;
  for (const message of messages) {
    const metadata = message.metadata;
    if (
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as { kind?: unknown }).kind === "inactivity_warning"
    ) {
      latestId = message.id;
    }
  }
  return latestId;
}
