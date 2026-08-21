import { describe, expect, it } from "vitest";
import { applyGuardrails } from "./guardrails";

describe("applyGuardrails", () => {
  it("blocks sourced answers without grounding", () => {
    const result = applyGuardrails("The answer is definitely yes.", {
      retrievedChunks: [],
      rule: { action: "search answer" },
      personAttributes: {},
    });

    expect(result.blocked).toBe(true);
    expect(result.actions).toContain("grounding_required");
  });

  it("redacts person attribute values from responses", () => {
    const result = applyGuardrails("Your account email is user@example.com.", {
      retrievedChunks: [{
        sourceId: "source",
        sourceName: "Help Center",
        content: "Account email details.",
        distance: 0.1,
      }],
      rule: { action: "search answer" },
      personAttributes: { email: "user@example.com" },
    });

    expect(result.responseText).toContain("[redacted]");
    expect(result.actions).toContain("personal_data_redacted");
  });
});
