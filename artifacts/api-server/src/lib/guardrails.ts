import type { RetrievedChunk } from "./llm";

export type GuardrailResult = {
  responseText: string;
  actions: string[];
  blocked: boolean;
};

export function applyGuardrails(
  responseText: string,
  input: {
    retrievedChunks: RetrievedChunk[];
    personAttributes: Record<string, unknown>;
    hasAuthorizedLiveData?: boolean;
  },
): GuardrailResult {
  const actions: string[] = [];
  if (input.retrievedChunks.length === 0 && !input.hasAuthorizedLiveData) {
    return {
      responseText,
      actions: ["grounding_required"],
      blocked: true,
    };
  }

  let guarded = responseText;
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
