export const UNABLE_TO_ANSWER_MESSAGE_KIND = "unable_to_answer";
export const ESCALATE_MESSAGE_ACTION = "escalate";

export function interpolateEscalationMessage(
  template: string,
  userName: string,
): string {
  return template.replaceAll("{user_name}", userName.trim() || "there").trim();
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
