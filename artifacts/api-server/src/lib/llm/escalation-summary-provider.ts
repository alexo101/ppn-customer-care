export type EscalationSummaryMessage = {
  sender: string;
  content: string;
};

export type EscalationSummaryInput = {
  messages: EscalationSummaryMessage[];
  reason: string;
  category: string;
  subcategory: string;
  previousAnswer: string;
  context: Record<string, unknown>;
};

export type EscalationSummaryParts = {
  customerRequest: string;
  whatAiTried: string;
  suggestedNextStep: string;
};

export type EscalationSummaryResult = EscalationSummaryParts & {
  summary: string;
  model: string;
};

export interface EscalationSummaryProvider {
  summarize(input: EscalationSummaryInput): Promise<EscalationSummaryResult>;
}

export class EscalationSummaryProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EscalationSummaryProviderError";
  }
}

export function formatEscalationSummary(parts: EscalationSummaryParts): string {
  return [
    `Request: ${parts.customerRequest.trim()}`,
    `What the agent tried: ${parts.whatAiTried.trim()}`,
    `Suggested next step: ${parts.suggestedNextStep.trim()}`,
  ].join("\n\n");
}

export function storedEscalationSummary(
  summary: string | null | undefined,
): string | null {
  const trimmed = summary?.trim() ?? "";
  return trimmed || null;
}
