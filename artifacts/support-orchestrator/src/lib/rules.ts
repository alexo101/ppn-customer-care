import type { OrchestratorRule, RuleAuthoringDraft } from "@workspace/api-client-react";

export function emptyRuleDraft(priority = 0): RuleAuthoringDraft {
  return normalizeDraft({
    name: "",
    description: "",
    promptTemplate: "",
    priority: Math.max(0, Math.min(100, priority)),
    requiresClarificationPrompt: "",
    escalationTrigger: false,
    isEnabled: true,
    conditionOperator: "is",
    action: "search answer",
    categoryIds: [],
    sourceIds: [],
    connectorIds: [],
    audienceTargetIds: [],
  });
}

export function draftFromRule(rule: OrchestratorRule): RuleAuthoringDraft {
  return normalizeDraft({
    name: rule.name,
    description: rule.description,
    promptTemplate: rule.promptTemplate,
    priority: rule.priority,
    requiresClarificationPrompt: rule.requiresClarificationPrompt ?? "",
    escalationTrigger: rule.escalationTrigger,
    isEnabled: rule.isEnabled,
    conditionOperator: rule.conditionOperator,
    action: rule.action,
    categoryIds: rule.categoryIds,
    sourceIds: rule.sourceIds,
    connectorIds: rule.connectorIds,
    audienceTargetIds: rule.audienceTargetIds,
  });
}

export function normalizeDraft(draft: RuleAuthoringDraft): RuleAuthoringDraft {
  return {
    ...draft,
    name: draft.name ?? "",
    description: draft.description ?? "",
    promptTemplate: draft.promptTemplate ?? "",
    requiresClarificationPrompt: draft.requiresClarificationPrompt ?? "",
    conditionOperator: draft.conditionOperator?.trim() || "is",
    action: draft.action?.trim() || "search answer",
    categoryIds: draft.categoryIds ?? [],
    sourceIds: draft.sourceIds ?? [],
    connectorIds: draft.connectorIds ?? [],
    audienceTargetIds: draft.audienceTargetIds ?? [],
  };
}

export function actionIsEscalation(action: string): boolean {
  return action.trim().toLowerCase().includes("escalat");
}

export function formatRuleSentence(input: {
  operator: string;
  categoryNames: string[];
  action: string;
  sourceNames: string[];
  requiresSource?: boolean;
  audienceTargetNames?: string[];
}): string {
  const operator = input.operator.trim() || "is";
  const action = input.action.trim() || "search answer";
  const categories = joinNames(input.categoryNames, "a category");
  const includeSource = input.requiresSource ?? actionUsesSource(action);
  const thenClause = includeSource
    ? `then ${action} in ${joinNames(input.sourceNames, "a source")}`
    : `then ${action}`;
  const audienceClause = input.audienceTargetNames?.length
    ? ` for ${joinNames(input.audienceTargetNames, "an audience")}`
    : "";
  return `If Category ${operator} ${categories} ${thenClause}${audienceClause}`;
}

export function actionUsesSource(action: string, requiresSource?: boolean): boolean {
  if (typeof requiresSource === "boolean") return requiresSource;
  const value = action.trim().toLowerCase();
  if (value.includes("escalat") || value.includes("clarif") || value.includes("template")) return false;
  return true;
}

function joinNames(names: string[], fallback: string): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  if (cleaned.length === 0) return fallback;
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} or ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")} or ${cleaned[cleaned.length - 1]}`;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return error.message.replace(/^HTTP \d+\s[^:]+:\s*/, "") || fallback;
}
