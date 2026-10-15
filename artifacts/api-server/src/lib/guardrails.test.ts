import { describe, expect, it } from "vitest";
import { applyGuardrails } from "./guardrails";

describe("applyGuardrails", () => {
  it("blocks answers without retrieved passages", () => {
    const result = applyGuardrails("The answer is definitely yes.", {
      retrievedChunks: [],
      personAttributes: {},
    });

    expect(result.blocked).toBe(true);
    expect(result.actions).toContain("grounding_required");
  });

  it("redacts person attribute values from responses", () => {
    const result = applyGuardrails("Your account email is user@example.com.", {
      retrievedChunks: [{
        sourceId: "article",
        sourceName: "Help Center",
        content: "Account email details.",
        distance: 0.1,
      }],
      personAttributes: { email: "user@example.com" },
    });

    expect(result.responseText).toContain("[redacted]");
    expect(result.blocked).toBe(false);
    expect(result.actions).toContain("personal_data_redacted");
  });
});
