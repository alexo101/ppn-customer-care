import { describe, expect, it } from "vitest";
import { DEFAULT_WELCOME_MESSAGE } from "./conversation-auto-close";
import {
  hasRequiredWelcomeTokens,
  interpolateWelcomeMessage,
  isTrainingConversation,
} from "./welcome-message";

describe("welcome message tokens", () => {
  it("accepts the default template", () => {
    expect(hasRequiredWelcomeTokens(DEFAULT_WELCOME_MESSAGE)).toBe(true);
  });

  it("rejects a message missing a required placeholder", () => {
    expect(
      hasRequiredWelcomeTokens("Hello {user_name}, how can I help you?"),
    ).toBe(false);
    expect(
      hasRequiredWelcomeTokens("You are speaking {agent_name}."),
    ).toBe(false);
  });
});

describe("interpolateWelcomeMessage", () => {
  it("replaces user and agent placeholders", () => {
    expect(
      interpolateWelcomeMessage(DEFAULT_WELCOME_MESSAGE, {
        userName: "Ada",
        agentName: "Nova",
      }),
    ).toBe("Hello Ada, you are speaking Nova Ai Agent. How can I help you?");
  });

  it("leaves unknown placeholders unchanged", () => {
    expect(
      interpolateWelcomeMessage("Hi {user_name} from {team}", {
        userName: "Lee",
        agentName: "Bot",
      }),
    ).toBe("Hi Lee from {team}");
  });
});

describe("isTrainingConversation", () => {
  it("is true only for training source metadata", () => {
    expect(isTrainingConversation({ source: "training" })).toBe(true);
    expect(isTrainingConversation({ source: "widget" })).toBe(false);
    expect(isTrainingConversation({})).toBe(false);
  });
});
