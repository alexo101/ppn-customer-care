export type RuleAuthoringDraft = {
  name: string;
  description: string;
  promptTemplate: string;
  priority: number;
  requiresClarificationPrompt: string;
  escalationTrigger: boolean;
  isEnabled: boolean;
  conditionOperator: string;
  conditionCountry?: "ES" | "FR" | "IT" | null;
  action: string;
  categoryIds?: string[];
  sourceIds?: string[];
  audienceTargetIds?: string[];
  httpMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpointUrl?: string;
};

export type NormalizedRuleAuthoringDraft = RuleAuthoringDraft & {
  categoryIds: string[];
  sourceIds: string[];
  audienceTargetIds: string[];
};

export type RuleAuthoringMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RuleAuthoringContext = {
  categories: Array<{ id: string; name: string }>;
  sources: Array<{ id: string; name: string }>;
  operators: Array<{ label: string }>;
  actions: Array<{ label: string; requiresSource: boolean }>;
  audienceTargets: Array<{ id: string; name: string; description: string }>;
  countries: Array<{ code: "ES" | "FR" | "IT"; label: string; domain: string }>;
};

export type RuleAuthoringModelResult = {
  status: "clarifying" | "ready";
  assistantMessage: string;
  draft: RuleAuthoringDraft | null;
  unresolvedFields: string[];
};

export type RuleAuthoringProviderInput = {
  messages: RuleAuthoringMessage[];
  currentDraft?: RuleAuthoringDraft;
  context: RuleAuthoringContext;
};

export interface RuleAuthoringProvider {
  generate(
    input: RuleAuthoringProviderInput,
  ): Promise<RuleAuthoringModelResult>;
}

export class RuleAuthoringProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RuleAuthoringProviderError";
  }
}
