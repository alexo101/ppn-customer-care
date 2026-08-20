import {
  actionUsesSources,
  formatRuleSentence,
  normalizeAction,
} from "./rule-engine";
import type {
  RuleAuthoringContext,
  RuleAuthoringDraft,
  RuleAuthoringMessage,
  RuleAuthoringModelResult,
  RuleAuthoringProvider,
} from "./llm";

export type RuleAuthoringStatus =
  "clarifying" | "ready_for_confirmation" | "needs_changes" | "approved";

export type RuleAuthoringResult = {
  status: RuleAuthoringStatus;
  assistantMessage: string;
  draft?: RuleAuthoringDraft;
  unresolvedFields: string[];
};

export type AuthorRuleInput = {
  message: string;
  history?: RuleAuthoringMessage[];
  draft?: RuleAuthoringDraft;
  awaitingConfirmation?: boolean;
  context: RuleAuthoringContext;
};

export async function authorRule(
  input: AuthorRuleInput,
  provider: RuleAuthoringProvider,
): Promise<RuleAuthoringResult> {
  const message = input.message.trim();

  if (input.awaitingConfirmation && input.draft && isApproval(message)) {
    const validated = validateDraft(input.draft, input.context);
    if (validated.unresolvedFields.length > 0 || !validated.draft) {
      return {
        status: "clarifying",
        assistantMessage: clarificationMessage(validated.unresolvedFields),
        draft: validated.draft,
        unresolvedFields: validated.unresolvedFields,
      };
    }
    return {
      status: "approved",
      assistantMessage: "Approved. I’ll save this rule now.",
      draft: validated.draft,
      unresolvedFields: [],
    };
  }

  if (input.awaitingConfirmation && input.draft && isBareRejection(message)) {
    return {
      status: "needs_changes",
      assistantMessage:
        "What would you like me to change in the proposed rule?",
      draft: input.draft,
      unresolvedFields: [],
    };
  }

  const messages = [
    ...(input.history ?? []).slice(-29),
    { role: "user" as const, content: message },
  ];
  const modelResult = await provider.generate({
    messages,
    currentDraft: input.draft,
    context: input.context,
  });
  const parsed = parseModelResult(modelResult);

  if (!parsed) {
    return {
      status: "clarifying",
      assistantMessage:
        "I couldn’t turn that into a valid rule yet. Could you restate the rule and include the category and desired action?",
      draft: input.draft,
      unresolvedFields: ["rule"],
    };
  }

  const validated = parsed.draft
    ? validateDraft(parsed.draft, input.context)
    : { draft: undefined, unresolvedFields: [] };
  const unresolvedFields = unique([
    ...parsed.unresolvedFields,
    ...validated.unresolvedFields,
  ]);

  if (
    parsed.status === "clarifying" ||
    unresolvedFields.length > 0 ||
    !validated.draft
  ) {
    const validationFoundIssues = validated.unresolvedFields.length > 0;
    return {
      status: "clarifying",
      assistantMessage: validationFoundIssues
        ? clarificationMessage(validated.unresolvedFields)
        : parsed.assistantMessage.trim() ||
          clarificationMessage(
            unresolvedFields.length ? unresolvedFields : ["rule"],
          ),
      draft: validated.draft ?? input.draft,
      unresolvedFields: unresolvedFields.length ? unresolvedFields : ["rule"],
    };
  }

  return {
    status: "ready_for_confirmation",
    assistantMessage:
      parsed.assistantMessage.trim() ||
      "Here is the rule I created. Is this correct? Reply OK to save it, or tell me what to change.",
    draft: validated.draft,
    unresolvedFields: [],
  };
}

export function validateDraft(
  draft: RuleAuthoringDraft,
  context: RuleAuthoringContext,
): { draft?: RuleAuthoringDraft; unresolvedFields: string[] } {
  const unresolvedFields: string[] = [];
  const categoryIds = unique(draft.categoryIds).filter((id) =>
    context.categories.some((category) => category.id === id),
  );
  if (
    categoryIds.length === 0 ||
    categoryIds.length !== unique(draft.categoryIds).length
  ) {
    unresolvedFields.push("categoryIds");
  }

  const operator = findLabel(draft.conditionOperator, context.operators);
  if (!operator) unresolvedFields.push("conditionOperator");

  const action = findLabel(draft.action, context.actions);
  if (!action) unresolvedFields.push("action");

  const sourceIds = unique(draft.sourceIds).filter((id) =>
    context.sources.some((source) => source.id === id),
  );
  const requiresSource = action
    ? actionUsesSources(
        action.label,
        context.actions.find((item) => item.label === action.label)
          ?.requiresSource,
      )
    : false;
  if (
    sourceIds.length !== unique(draft.sourceIds).length ||
    (requiresSource && sourceIds.length === 0)
  ) {
    unresolvedFields.push("sourceIds");
  }

  if (
    !Number.isFinite(draft.priority) ||
    !Number.isInteger(draft.priority) ||
    draft.priority < 0 ||
    draft.priority > 100
  ) {
    unresolvedFields.push("priority");
  }

  if (
    action &&
    normalizeAction(action.label) === "ask_clarification" &&
    !draft.requiresClarificationPrompt.trim()
  ) {
    unresolvedFields.push("requiresClarificationPrompt");
  }
  if (
    action &&
    normalizeAction(action.label) === "generate_from_template" &&
    !draft.promptTemplate.trim()
  ) {
    unresolvedFields.push("promptTemplate");
  }

  if (!operator || !action) {
    return { unresolvedFields: unique(unresolvedFields) };
  }

  const categoryNames = categoryIds
    .map(
      (id) => context.categories.find((category) => category.id === id)?.name,
    )
    .filter((name): name is string => Boolean(name));
  const sourceNames = sourceIds
    .map((id) => context.sources.find((source) => source.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const sentence = formatRuleSentence({
    operator: operator.label,
    categoryNames,
    action: action.label,
    sourceNames,
    requiresSource,
  });

  return {
    draft: {
      name: sentence,
      description: sentence,
      promptTemplate: draft.promptTemplate.trim(),
      priority: draft.priority,
      requiresClarificationPrompt: draft.requiresClarificationPrompt.trim(),
      escalationTrigger: normalizeAction(action.label) === "escalate",
      isEnabled: draft.isEnabled,
      conditionOperator: operator.label,
      action: action.label,
      categoryIds,
      sourceIds: requiresSource ? sourceIds : [],
    },
    unresolvedFields: unique(unresolvedFields),
  };
}

export function isApproval(message: string): boolean {
  return /^(ok(?:ay)?|yes|yep|confirm(?:ed)?|approve(?:d)?|save(?: it)?|looks good|that(?:'s| is) correct)[.!]?$/i.test(
    message.trim(),
  );
}

function isBareRejection(message: string): boolean {
  return /^(no|nope|not yet|not quite|reject|change it)[.!]?$/i.test(
    message.trim(),
  );
}

function parseModelResult(
  value: RuleAuthoringModelResult,
): RuleAuthoringModelResult | null {
  if (!value || (value.status !== "clarifying" && value.status !== "ready")) {
    return null;
  }
  if (
    typeof value.assistantMessage !== "string" ||
    !Array.isArray(value.unresolvedFields) ||
    value.unresolvedFields.some((field) => typeof field !== "string")
  ) {
    return null;
  }
  if (value.draft !== null && !isDraft(value.draft)) return null;
  return value;
}

function isDraft(value: unknown): value is RuleAuthoringDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.name === "string" &&
    typeof draft.description === "string" &&
    typeof draft.promptTemplate === "string" &&
    typeof draft.priority === "number" &&
    typeof draft.requiresClarificationPrompt === "string" &&
    typeof draft.escalationTrigger === "boolean" &&
    typeof draft.isEnabled === "boolean" &&
    typeof draft.conditionOperator === "string" &&
    typeof draft.action === "string" &&
    Array.isArray(draft.categoryIds) &&
    draft.categoryIds.every((id) => typeof id === "string") &&
    Array.isArray(draft.sourceIds) &&
    draft.sourceIds.every((id) => typeof id === "string")
  );
}

function findLabel<T extends { label: string }>(
  value: string,
  options: T[],
): T | undefined {
  const normalized = value.trim().toLowerCase();
  return options.find(
    (option) => option.label.trim().toLowerCase() === normalized,
  );
}

function clarificationMessage(fields: string[]): string {
  const labels: Record<string, string> = {
    categoryIds: "which existing category this rule should match",
    conditionOperator: "which condition operator to use",
    action: "which action the rule should take",
    sourceIds: "which existing source the action should use",
    priority: "a priority from 0 to 100",
    requiresClarificationPrompt:
      "the clarification question the agent should ask",
    promptTemplate: "the response template the agent should generate",
    rule: "the category and action for the rule",
  };
  const first = fields[0] ?? "rule";
  return `I still need ${labels[first] ?? first}. What should it be?`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
