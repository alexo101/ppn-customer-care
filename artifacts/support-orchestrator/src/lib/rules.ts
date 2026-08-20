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
