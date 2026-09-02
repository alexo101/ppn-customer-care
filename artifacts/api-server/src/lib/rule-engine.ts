export type OperatorKind =
  "is" | "is_not" | "contains" | "starts_with" | "ends_with" | "matches" | "in";

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

export const RULE_COUNTRIES = [
  { code: "ES", label: "Spain", domain: "app.papernest.es" },
  { code: "FR", label: "France", domain: "app.papernest.com" },
  { code: "IT", label: "Italy", domain: "app.papernest.it" },
] as const;

export type RuleCountryCode = (typeof RULE_COUNTRIES)[number]["code"];

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export function normalizeHttpMethod(value: unknown): HttpMethod {
  const method = typeof value === "string" ? value.trim().toUpperCase() : "";
  return HTTP_METHODS.includes(method as HttpMethod) ? (method as HttpMethod) : "GET";
}

export const DEFAULT_OPERATORS = [
  { label: "is", slug: "is", requiresSource: false, sortOrder: 1 },
  { label: "is not", slug: "is_not", requiresSource: false, sortOrder: 2 },
  { label: "contains", slug: "contains", requiresSource: false, sortOrder: 3 },
  {
    label: "starts with",
    slug: "starts_with",
    requiresSource: false,
    sortOrder: 4,
  },
  {
    label: "ends with",
    slug: "ends_with",
    requiresSource: false,
    sortOrder: 5,
  },
  { label: "matches", slug: "matches", requiresSource: false, sortOrder: 6 },
  { label: "in", slug: "in", requiresSource: false, sortOrder: 7 },
] as const;

export const DEFAULT_ACTIONS = [
  {
    label: "search answer",
    slug: "search_answer",
    requiresSource: true,
    sortOrder: 1,
  },
  {
    label: "query live data",
    slug: "query_live_data",
    requiresSource: true,
    sortOrder: 2,
  },
  {
    label: "generate from template",
    slug: "generate_from_template",
    requiresSource: false,
    sortOrder: 3,
  },
  {
    label: "ask clarification",
    slug: "ask_clarification",
    requiresSource: false,
    sortOrder: 4,
  },
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

  if (
    slug === "is" ||
    slug === "equals" ||
    slug === "eq" ||
    value === "=" ||
    value === "=="
  )
    return "is";
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
  if (
    slug === "contains" ||
    slug === "includes" ||
    value.includes("contain") ||
    value.includes("include")
  ) {
    return "contains";
  }
  if (
    slug === "starts_with" ||
    slug === "prefix" ||
    value.includes("start") ||
    value.includes("prefix")
  ) {
    return "starts_with";
  }
  if (
    slug === "ends_with" ||
    slug === "suffix" ||
    value.includes("end") ||
    value.includes("suffix")
  ) {
    return "ends_with";
  }
  if (
    slug === "matches" ||
    slug === "like" ||
    slug === "regex" ||
    value.includes("match") ||
    value.includes("like")
  ) {
    return "matches";
  }
  if (
    slug === "in" ||
    slug === "any_of" ||
    slug === "one_of" ||
    /\bin\b/.test(value)
  )
    return "in";
  return "is";
}

export function normalizeAction(label: string): ActionKind {
  const value = label.trim().toLowerCase();
  const slug = slugifyLabel(value);

  if (
    slug === "escalate" ||
    value.includes("escalate") ||
    value.includes("human") ||
    value.includes("transfer")
  ) {
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

export function actionUsesSources(
  label: string,
  requiresSource?: boolean,
): boolean {
  if (typeof requiresSource === "boolean") return requiresSource;
  const kind = normalizeAction(label);
  return (
    kind === "search_answer" || kind === "query_live_data" || kind === "custom"
  );
}

export function normalizeDomain(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const url = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    );
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed
      .replace(/^[a-z]+:\/\//, "")
      .split("/")[0]
      .split("?")[0]
      .split("#")[0]
      .replace(/^www\./, "");
  }
}

export function countryMatchesDomain(
  conditionCountry: string | null | undefined,
  requestDomain: unknown,
): boolean {
  if (!conditionCountry) return true;
  const country = RULE_COUNTRIES.find(
    (item) => item.code === conditionCountry.trim().toUpperCase(),
  );
  return Boolean(country && normalizeDomain(requestDomain) === country.domain);
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
  const targetNames = targets
    .map((target) => target.name.trim().toLowerCase())
    .filter(Boolean);

  switch (kind) {
    case "is":
    case "in":
      return targetIds.has(classified.id);
    case "is_not":
      return !targetIds.has(classified.id);
    case "contains":
      return targetNames.some(
        (name) =>
          classifiedName.includes(name) || name.includes(classifiedName),
      );
    case "starts_with":
      return targetNames.some(
        (name) =>
          classifiedName.startsWith(name) || name.startsWith(classifiedName),
      );
    case "ends_with":
      return targetNames.some(
        (name) =>
          classifiedName.endsWith(name) || name.endsWith(classifiedName),
      );
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
  countryLabel?: string;
  connectorNames?: string[];
  promptTemplate?: string;
  clarificationPrompt?: string;
  httpMethod?: string;
  endpointUrl?: string;
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
  const includeSource = actionUsesSources(action, input.requiresSource);
  const kind = normalizeAction(action);
  const countryClause = input.countryLabel?.trim()
    ? `the user is accessing ${input.countryLabel.trim()}`
    : "";
  const categoryClause = `${countryClause ? "" : "the user "}asks about ${categories}`;
  const audienceClause = input.audienceTargetNames?.length
    ? `belongs to ${joinNames(input.audienceTargetNames, "an audience")}`
    : "";
  let actionClause: string;
  if (kind === "query_live_data") {
    const method = normalizeHttpMethod(input.httpMethod);
    const url = input.endpointUrl?.trim();
    actionClause = url ? `call ${method} ${url}` : "query live data";
  } else if (kind === "generate_from_template") {
    actionClause = `answer using the ${input.promptTemplate?.trim() || "configured"} template`;
  } else if (kind === "ask_clarification") {
    actionClause = input.clarificationPrompt?.trim()
      ? `ask: "${input.clarificationPrompt.trim()}"`
      : "ask a clarification question";
  } else if (kind === "escalate") {
    actionClause = "escalate to a human agent";
  } else if (kind === "search_answer") {
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

function joinNames(names: string[], fallback: string): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  if (cleaned.length === 0) return fallback;
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} or ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")} or ${cleaned[cleaned.length - 1]}`;
}
