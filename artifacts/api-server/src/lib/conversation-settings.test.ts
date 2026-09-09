import { describe, expect, it } from "vitest";
import {
  SubmitConversationNpsBody,
  UpdateAgentConversationSettingsBody,
} from "@workspace/api-zod";
import {
  DEFAULT_CONVERSATION_SETTINGS,
  DEFAULT_ESCALATION_MESSAGE,
} from "./conversation-auto-close";

describe("conversation settings defaults", () => {
  it("uses the configured default escalation prompt", () => {
    expect(DEFAULT_CONVERSATION_SETTINGS.escalationMessage).toBe(
      DEFAULT_ESCALATION_MESSAGE,
    );
    expect(DEFAULT_CONVERSATION_SETTINGS.escalationMessage).toContain(
      "{user_name}",
    );
  });
});

describe("conversation settings input", () => {
  it("accepts a valid auto-close configuration", () => {
    const parsed = UpdateAgentConversationSettingsBody.safeParse({
      autoCloseDays: 1,
      autoCloseHours: 2,
      autoCloseMinutes: 30,
      closingMessage: "Thanks 👋",
      welcomeMessage:
        "Hello {user_name}, you are speaking {agent_name} Ai Agent. How can I help you?",
      escalationMessage:
        "Sorry {user_name}, I'm not able to answer this message.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects duration values outside the allowed range", () => {
    const welcomeMessage =
      "Hello {user_name}, you are speaking {agent_name} Ai Agent. How can I help you?";
    expect(
      UpdateAgentConversationSettingsBody.safeParse({
        autoCloseDays: 366,
        autoCloseHours: 0,
        autoCloseMinutes: 0,
        closingMessage: "",
        welcomeMessage,
        escalationMessage: "Sorry {user_name}, I cannot answer that.",
      }).success,
    ).toBe(false);
    expect(
      UpdateAgentConversationSettingsBody.safeParse({
        autoCloseDays: 0,
        autoCloseHours: 24,
        autoCloseMinutes: 0,
        closingMessage: "",
        welcomeMessage,
        escalationMessage: "Sorry {user_name}, I cannot answer that.",
      }).success,
    ).toBe(false);
    expect(
      UpdateAgentConversationSettingsBody.safeParse({
        autoCloseDays: 0,
        autoCloseHours: 0,
        autoCloseMinutes: 60,
        closingMessage: "",
        welcomeMessage,
        escalationMessage: "Sorry {user_name}, I cannot answer that.",
      }).success,
    ).toBe(false);
  });
});

describe("NPS input", () => {
  it("accepts scores from 1 to 10", () => {
    expect(SubmitConversationNpsBody.safeParse({ score: 1 }).success).toBe(
      true,
    );
    expect(SubmitConversationNpsBody.safeParse({ score: 10 }).success).toBe(
      true,
    );
  });

  it("rejects scores outside 1-10", () => {
    expect(SubmitConversationNpsBody.safeParse({ score: 0 }).success).toBe(
      false,
    );
    expect(SubmitConversationNpsBody.safeParse({ score: 11 }).success).toBe(
      false,
    );
  });
});
