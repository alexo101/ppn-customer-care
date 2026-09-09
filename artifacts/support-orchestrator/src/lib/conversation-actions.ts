export type ConversationMessageLike = {
  id: string;
  sender: string;
  metadata?: unknown;
};

export function isEscalationOfferMessage(
  message: ConversationMessageLike,
): boolean {
  if (message.sender !== "assistant" || !message.metadata) return false;
  if (typeof message.metadata !== "object" || Array.isArray(message.metadata)) {
    return false;
  }
  const metadata = message.metadata as { kind?: unknown; actions?: unknown };
  return (
    metadata.kind === "unable_to_answer" &&
    Array.isArray(metadata.actions) &&
    metadata.actions.includes("escalate")
  );
}

export function latestEscalationOffer(
  messages: readonly ConversationMessageLike[],
  dismissedMessageId?: string | null,
): ConversationMessageLike | undefined {
  const latest = [...messages].reverse().find(isEscalationOfferMessage);
  return latest?.id === dismissedMessageId ? undefined : latest;
}
