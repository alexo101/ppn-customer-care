export const PERSON_TYPES = ["visitor", "lead", "user"] as const;
export const MATCH_MODES = ["all", "any"] as const;
export const OPERATORS = [
  "is",
  "is_not",
  "contains",
  "does_not_contain",
  "starts_with",
  "ends_with",
  "is_known",
  "is_unknown",
] as const;
export const ATTRIBUTES = [
  "email",
  "phone_number",
  "phone_number_prefix",
  "name",
  "user_id",
  "company",
  "country",
  "city",
  "current_page_url",
  "referring_url",
  "browser_language",
] as const;

export type PersonType = (typeof PERSON_TYPES)[number];
export type MatchMode = (typeof MATCH_MODES)[number];
export type Operator = (typeof OPERATORS)[number];
export type Attribute = (typeof ATTRIBUTES)[number];

export const VALUELESS_OPERATORS = new Set<Operator>(["is_known", "is_unknown"]);

export const ATTRIBUTES_BY_PERSON: Record<PersonType, readonly Attribute[]> = {
  visitor: ["current_page_url", "referring_url", "browser_language", "country", "city"],
  lead: ["email", "phone_number", "phone_number_prefix", "name", "country", "city", "current_page_url"],
  user: ["email", "phone_number", "phone_number_prefix", "name", "user_id", "company", "country", "city"],
};

export type TargetConditionDraft = {
  personType: PersonType;
  attribute: Attribute;
  operator: Operator;
  value?: string;
};

export function isPersonType(value: string): value is PersonType {
  return (PERSON_TYPES as readonly string[]).includes(value);
}

export function isMatchMode(value: string): value is MatchMode {
  return (MATCH_MODES as readonly string[]).includes(value);
}

export function isOperator(value: string): value is Operator {
  return (OPERATORS as readonly string[]).includes(value);
}

export function isAttribute(value: string): value is Attribute {
  return (ATTRIBUTES as readonly string[]).includes(value);
}

export function validateTargetCondition(condition: TargetConditionDraft): string | null {
  if (!isPersonType(condition.personType)) return "Choose visitor, lead, or user.";
  if (!isAttribute(condition.attribute)) return "Choose a valid attribute.";
  if (!ATTRIBUTES_BY_PERSON[condition.personType].includes(condition.attribute)) {
    return `That attribute is not available for ${condition.personType}s.`;
  }
  if (!isOperator(condition.operator)) return "Choose a valid operator.";
  if (VALUELESS_OPERATORS.has(condition.operator)) return null;
  if (!condition.value?.trim()) return "Enter a value for this condition.";
  return null;
}
