export type OperatorKind =
  | "is"
  | "is_not"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "matches"
  | "in";

export type ActionKind =
  | "search_answer"
  | "query_live_data"
  | "generate_from_template"
  | "ask_clarification"
  | "escalate"
  | "custom";

export type NamedTarget = {
  id: string;
  name: string;
};

export const DEFAULT_OPERATORS = [
  { label: "is", slug: "is", requiresSource: false, sortOrder: 1 },
  { label: "is not", slug: "is_not", requiresSource: false, sortOrder: 2 },
  { label: "contains", slug: "contains", requiresSource: false, sortOrder: 3 },
  { label: "starts with", slug: "starts_with", requiresSource: false, sortOrder: 4 },
  { label: "ends with", slug: "ends_with", requiresSource: false, sortOrder: 5 },
  { label: "matches", slug: "matches", requiresSource: false, sortOrder: 6 },
  { label: "in", slug: "in", requiresSource: false, sortOrder: 7 },
] as const;

export const DEFAULT_ACTIONS = [
  { label: "search answer", slug: "search_answer", requiresSource: true, sortOrder: 1 },
  { label: "query live data", slug: "query_live_data", requiresSource: true, sortOrder: 2 },
  { label: "generate from template", slug: "generate_from_template", requiresSource: false, sortOrder: 3 },
  { label: "ask clarification", slug: "ask_clarification", requiresSource: false, sortOrder: 4 },
  { label: "escalate", slug: "escalate", requiresSource: false, sortOrder: 5 },
] as const;

export function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function normalizeOperator(label: string): OperatorKind {
  const value = label.trim().toLowerCase();
  const slug = slugifyLabel(value);

  if (slug === "is" || slug === "equals" || slug === "eq" || value === "=" || value === "==") return "is";
  if (
    slug === "is_not" ||
    slug === "isnt" ||
    slug === "not" ||
    slug === "not_equals" ||
    slug === "ne" ||
    value === "!=" ||
    value.includes("not")
  ) {
    return "is_not";
  }
  if (slug === "contains" || slug === "includes" || value.includes("contain") || value.includes("include")) {
    return "contains";
  }
  if (slug === "starts_with" || slug === "prefix" || value.includes("start") || value.includes("prefix")) {
    return "starts_with";
  }
  if (slug === "ends_with" || slug === "suffix" || value.includes("end") || value.includes("suffix")) {
    return "ends_with";
  }
  if (slug === "matches" || slug === "like" || slug === "regex" || value.includes("match") || value.includes("like")) {
    return "matches";
  }
  if (slug === "in" || slug === "any_of" || slug === "one_of" || /\bin\b/.test(value)) return "in";
  return "is";
}

export function normalizeAction(label: string): ActionKind {
  const value = label.trim().toLowerCase();
  const slug = slugifyLabel(value);

  if (slug === "escalate" || value.includes("escalate") || value.includes("human") || value.includes("transfer")) {
    return "escalate";
  }
  if (slug === "ask_clarification" || value.includes("clarif")) {
    return "ask_clarification";
  }
  if (
    slug === "query_live_data" ||
    value.includes("live data") ||
    value.includes("query") ||
    value.includes("lookup") ||
    value.includes("look up")
  ) {
    return "query_live_data";
  }
  if (
    slug === "generate_from_template" ||
    value.includes("template") ||
    value.includes("generate")
  ) {
    return "generate_from_template";
  }
  if (
    slug === "search_answer" ||
    value.includes("search") ||
    value.includes("answer") ||
    value.includes("retrieve")
  ) {
    return "search_answer";
  }
  return "custom";
}

export function actionUsesSources(label: string, requiresSource?: boolean): boolean {
  if (typeof requiresSource === "boolean") return requiresSource;
  const kind = normalizeAction(label);
  return kind === "search_answer" || kind === "query_live_data" || kind === "custom";
}

export function categoryMatchesOperator(
  operator: string,
  classified: NamedTarget | null,
  targets: NamedTarget[],
): boolean {
  if (!classified || targets.length === 0) return false;

  const kind = normalizeOperator(operator);
  const classifiedName = classified.name.trim().toLowerCase();
  const targetIds = new Set(targets.map((target) => target.id));
  const targetNames = targets.map((target) => target.name.trim().toLowerCase()).filter(Boolean);

  switch (kind) {
    case "is":
    case "in":
      return targetIds.has(classified.id);
    case "is_not":
      return !targetIds.has(classified.id);
    case "contains":
      return targetNames.some(
        (name) => classifiedName.includes(name) || name.includes(classifiedName),
      );
    case "starts_with":
      return targetNames.some((name) => classifiedName.startsWith(name) || name.startsWith(classifiedName));
    case "ends_with":
      return targetNames.some((name) => classifiedName.endsWith(name) || name.endsWith(classifiedName));
    case "matches":
      return targetNames.some((name) => {
        try {
          return new RegExp(name, "i").test(classified.name);
        } catch {
          return classifiedName === name;
        }
      });
    default:
      return targetIds.has(classified.id);
  }
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
  const includeSource = actionUsesSources(action, input.requiresSource);
  const thenClause = includeSource
    ? `then ${action} in ${joinNames(input.sourceNames, "a source")}`
    : `then ${action}`;
  const audienceClause = input.audienceTargetNames?.length
    ? ` for ${joinNames(input.audienceTargetNames, "an audience")}`
    : "";
  return `If Category ${operator} ${categories} ${thenClause}${audienceClause}`;
}

function joinNames(names: string[], fallback: string): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  if (cleaned.length === 0) return fallback;
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} or ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")} or ${cleaned[cleaned.length - 1]}`;
}
