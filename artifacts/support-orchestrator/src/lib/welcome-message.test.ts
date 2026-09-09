import { describe, expect, it } from "vitest";
import {
  DEFAULT_ESCALATION_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  hasRequiredEscalationTokens,
  hasRequiredWelcomeTokens,
  parseWelcomeTemplate,
} from "./welcome-message";

describe("hasRequiredWelcomeTokens", () => {
  it("requires both placeholders", () => {
    expect(hasRequiredWelcomeTokens(DEFAULT_WELCOME_MESSAGE)).toBe(true);
    expect(hasRequiredWelcomeTokens("Hello there")).toBe(false);
    expect(hasRequiredWelcomeTokens("Hello {user_name}")).toBe(false);
  });
});

describe("parseWelcomeTemplate", () => {
  it("keeps required tokens as locked segments", () => {
    expect(parseWelcomeTemplate(DEFAULT_WELCOME_MESSAGE)).toEqual([
      { type: "text", value: "Hello " },
      { type: "token", value: "{user_name}" },
      { type: "text", value: ", you are speaking " },
      { type: "token", value: "{agent_name}" },
      { type: "text", value: " Ai Agent. How can I help you?" },
    ]);
  });
});

describe("hasRequiredEscalationTokens", () => {
  it("requires the visitor placeholder", () => {
    expect(hasRequiredEscalationTokens(DEFAULT_ESCALATION_MESSAGE)).toBe(true);
    expect(hasRequiredEscalationTokens("I cannot answer that.")).toBe(false);
  });
});
