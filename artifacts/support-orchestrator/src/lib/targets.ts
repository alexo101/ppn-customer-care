import type {
  TargetAttribute,
  TargetCondition,
  TargetConditionInput,
  TargetOperator,
  TargetPersonType,
} from "@workspace/api-client-react";

export const PERSON_TYPE_DEFINITIONS: {
  id: TargetPersonType;
  label: string;
  description: string;
}[] = [
  {
    id: "user",
    label: "Users",
    description: "Anyone who has signed up to your product or logged in to an existing account.",
  },
];

export const PERSON_TYPE_LABELS: Record<TargetPersonType, string> = {
  visitor: "Visitor",
  lead: "Lead",
  user: "User",
};

export const ATTRIBUTE_LABELS: Record<TargetAttribute, string> = {
  email: "email",
  phone_number: "phone number",
  phone_number_prefix: "phone number prefix",
  name: "name",
  user_id: "user ID",
  company: "company",
  country: "country",
  city: "city",
  app_domain: "app domain",
  current_page_url: "current page URL",
  referring_url: "referring URL",
  browser_language: "browser language",
};

export const OPERATOR_LABELS: Record<TargetOperator, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  does_not_contain: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  is_known: "is known",
  is_unknown: "is unknown",
};

export const ATTRIBUTES_BY_PERSON: Record<TargetPersonType, TargetAttribute[]> = {
  visitor: ["current_page_url", "referring_url", "browser_language", "country", "city"],
  lead: ["email", "phone_number", "phone_number_prefix", "name", "country", "city", "current_page_url"],
  user: ["email", "app_domain", "phone_number", "phone_number_prefix", "name", "user_id", "company", "country", "city"],
};

export const OPERATORS: TargetOperator[] = [
  "is",
  "is_not",
  "contains",
  "does_not_contain",
  "starts_with",
  "ends_with",
  "is_known",
  "is_unknown",
];

export const VALUELESS_OPERATORS = new Set<TargetOperator>(["is_known", "is_unknown"]);

export const EVERYONE_TARGET_NAME = "Everyone";

export function isCatchAllTarget(target: { conditions: unknown[] }): boolean {
  return target.conditions.length === 0;
}

export function defaultCondition(personType: TargetPersonType = "user"): TargetConditionInput {
  const attributes = ATTRIBUTES_BY_PERSON[personType];
  const attribute = attributes.includes("email") ? "email" : attributes[0];
  return {
    personType,
    attribute,
    operator: attribute === "phone_number_prefix" ? "starts_with" : "contains",
    value: "",
  };
}

export function coerceAttribute(personType: TargetPersonType, attribute: TargetAttribute): TargetAttribute {
  const allowed = ATTRIBUTES_BY_PERSON[personType];
  return allowed.includes(attribute) ? attribute : allowed[0];
}

export function formatCondition(condition: Pick<TargetCondition, "personType" | "attribute" | "operator" | "value">) {
  const person = PERSON_TYPE_LABELS[condition.personType];
  const attribute = ATTRIBUTE_LABELS[condition.attribute];
  const operator = OPERATOR_LABELS[condition.operator];
  if (VALUELESS_OPERATORS.has(condition.operator)) {
    return `${person} ${attribute} ${operator}`;
  }
  const value = condition.value.trim() || "…";
  return `${person} ${attribute} ${operator} ${value}`;
}
