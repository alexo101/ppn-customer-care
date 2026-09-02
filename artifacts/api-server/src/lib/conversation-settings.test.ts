import { describe, expect, it } from "vitest";
import { UpdateAgentConversationSettingsBody } from "@workspace/api-zod";

describe("conversation settings input", () => {
  it("accepts a valid auto-close configuration", () => {
    const parsed = UpdateAgentConversationSettingsBody.safeParse({
      autoCloseDays: 1,
      autoCloseHours: 2,
      autoCloseMinutes: 30,
      closingMessage: "Thanks 👋",
      askIfResolved: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects duration values outside the allowed range", () => {
    expect(
      UpdateAgentConversationSettingsBody.safeParse({
        autoCloseDays: 366,
        autoCloseHours: 0,
        autoCloseMinutes: 0,
        closingMessage: "",
        askIfResolved: false,
      }).success,
    ).toBe(false);
    expect(
      UpdateAgentConversationSettingsBody.safeParse({
        autoCloseDays: 0,
        autoCloseHours: 24,
        autoCloseMinutes: 0,
        closingMessage: "",
        askIfResolved: false,
      }).success,
    ).toBe(false);
    expect(
      UpdateAgentConversationSettingsBody.safeParse({
        autoCloseDays: 0,
        autoCloseHours: 0,
        autoCloseMinutes: 60,
        closingMessage: "",
        askIfResolved: false,
      }).success,
    ).toBe(false);
  });
});
