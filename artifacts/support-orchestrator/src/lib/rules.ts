import type {
  OrchestratorRule,
  RuleAuthoringDraft,
} from "@workspace/api-client-react";

export const RULE_COUNTRIES = [
  { code: "ES", label: "Spain", domain: "app.papernest.es" },
  { code: "FR", label: "France", domain: "app.papernest.com" },
  { code: "IT", label: "Italy", domain: "app.papernest.it" },
] as const;

export function emptyRuleDraft(priority = 0): RuleAuthoringDraft {
  return normalizeDraft({
    name: "",
    description: "",
    promptTemplate: "",
    priority: Math.max(0, priority),
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
    conditionCountry: rule.conditionCountry ?? null,
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
    conditionCountry: draft.conditionCountry ?? null,
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

export function formatCategoryPath(
  categoryId: string,
  categories: Array<{ id: string; name: string; parentId?: string | null }>,
): string {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const category = byId.get(categoryId);
  if (!category) return categoryId;
  const parent = category.parentId ? byId.get(category.parentId) : undefined;
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

export function formatRuleSentence(input: {
  operator: string;
  categoryNames: string[];
  action: string;
  sourceNames: string[];
  requiresSource?: boolean;
  audienceTargetNames?: string[];
  countryLabel?: string;
  connectorNames?: string[];
  promptTemplate?: string;
  clarificationPrompt?: string;
}): string {
  const action = input.action.trim() || "search answer";
  const categoryNames = input.categoryNames
    .map((name) => name.trim())
    .filter(Boolean);
  if (
    categoryNames.length > 1 &&
    categoryNames[1]?.startsWith(`${categoryNames[0]} / `)
  ) {
    categoryNames[1] = categoryNames[1].slice(categoryNames[0].length + 3);
  }
  const categories =
    categoryNames.length > 1 && categoryNames[1]
      ? `${categoryNames[0]} → ${categoryNames[1]}`
      : joinNames(categoryNames, "a category");
  const includeSource = input.requiresSource ?? actionUsesSource(action);
  const kind = action.toLowerCase();
  const countryClause = input.countryLabel?.trim()
    ? `the user is accessing ${input.countryLabel.trim()}`
    : "";
  const categoryClause = `${countryClause ? "" : "the user "}asks about ${categories}`;
  const audienceClause = input.audienceTargetNames?.length
    ? `belongs to ${joinNames(input.audienceTargetNames, "an audience")}`
    : "";
  let actionClause: string;
  if (
    kind.includes("live data") ||
    kind.includes("query") ||
    kind.includes("lookup")
  ) {
    actionClause = `call ${joinNames(input.connectorNames ?? [], "the API")} to retrieve ${input.promptTemplate?.trim() || "the requested data"}`;
  } else if (kind.includes("template") || kind.includes("generate")) {
    actionClause = `answer using the ${input.promptTemplate?.trim() || "configured"} template`;
  } else if (kind.includes("clarif")) {
    actionClause = input.clarificationPrompt?.trim()
      ? `ask: "${input.clarificationPrompt.trim()}"`
      : "ask a clarification question";
  } else if (
    kind.includes("escalat") ||
    kind.includes("human") ||
    kind.includes("transfer")
  ) {
    actionClause = "escalate to a human agent";
  } else if (
    kind.includes("search") ||
    kind.includes("answer") ||
    kind.includes("retrieve")
  ) {
    actionClause = `search ${joinNames(input.sourceNames, "the knowledge source")} for an answer`;
  } else {
    actionClause = action;
  }
  const clauses = [countryClause, categoryClause, audienceClause].filter(
    Boolean,
  );
  const prefix =
    clauses.length === 0
      ? "When"
      : `When ${clauses.length === 1 ? clauses[0] : `${clauses.slice(0, -1).join(", ")}, and ${clauses.at(-1)}`}`;
  return `${prefix}, ${actionClause}.`;
}

export function actionUsesSource(
  action: string,
  requiresSource?: boolean,
): boolean {
  if (typeof requiresSource === "boolean") return requiresSource;
  const value = action.trim().toLowerCase();
  if (
    value.includes("escalat") ||
    value.includes("clarif") ||
    value.includes("template")
  )
    return false;
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
  const stripped = error.message.replace(/^HTTP \d+\s[^:]+:\s*/, "").trim();
  if (!stripped) return fallback;
  const sample = stripped.slice(0, 200).toLowerCase();
  if (
    sample.startsWith("<!doctype") ||
    sample.startsWith("<html") ||
    sample.includes("<pre>") ||
    /<[a-z][\s\S]*>/i.test(stripped)
  ) {
    return fallback;
  }
  return stripped;
}
