const HIDDEN_CUSTOMER_KEYS = new Set([
  "userQuestion",
  "userId",
  "email",
  "customerName",
  "userName",
  "name",
  "firstName",
  "lastName",
  "priority",
]);

export function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function humanizeKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function customerContextFields(context: Record<string, unknown>) {
  return Object.entries(context)
    .filter(([key]) => !HIDDEN_CUSTOMER_KEYS.has(key))
    .map(([key, value]) => ({
      key,
      label: humanizeKey(key),
      value: stringValue(value),
    }))
    .filter((row) => row.value && row.value !== "{}");
}
