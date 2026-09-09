import { normalizeAction } from "./rule-engine";
import type { RetrievedChunk } from "./llm";

type Rule = { action: string } | null;

export type GuardrailResult = {
  responseText: string;
  actions: string[];
  blocked: boolean;
};

export function applyGuardrails(
  responseText: string,
  input: {
    retrievedChunks: RetrievedChunk[];
    rule: Rule;
    personAttributes: Record<string, unknown>;
  },
): GuardrailResult {
  const actions: string[] = [];
  let guarded = responseText;
  const action = input.rule ? normalizeAction(input.rule.action) : null;
  const requiresGrounding =
    action === "search_answer" || action === "query_live_data";

  if (requiresGrounding && input.retrievedChunks.length === 0) {
    return {
      responseText: guarded,
      actions: ["grounding_required"],
      blocked: true,
    };
  }

  for (const value of Object.values(input.personAttributes)) {
    if (typeof value !== "string" || value.length < 4) continue;
    if (!guarded.toLowerCase().includes(value.toLowerCase())) continue;
    guarded = guarded.replaceAll(value, "[redacted]");
    actions.push("personal_data_redacted");
  }

  return {
    responseText: guarded,
    actions: [...new Set(actions)],
    blocked: false,
  };
}
