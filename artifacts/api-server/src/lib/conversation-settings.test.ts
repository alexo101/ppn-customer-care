import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SubmitConversationNpsBody,
  SubmitConversationRatingBody,
  UpdateAgentConversationSettingsBody,
} from "@workspace/api-zod";
import {
  DEFAULT_CONVERSATION_SETTINGS,
  DEFAULT_ESCALATION_MESSAGE,
  isValidInactivitySettings,
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

  it("keeps the existing one-hour auto-close as the default", () => {
    expect(DEFAULT_CONVERSATION_SETTINGS).toMatchObject({
      warningAfterMinutes: 0,
      autoCloseAfterMinutes: 60,
    });
  });
});

describe("auto-close migrations", () => {
  const migration = readFileSync(
    new URL("../../../../lib/db/drizzle/0015_conversation_warning_close_rating.sql", import.meta.url),
    "utf8",
  );
  const repair = readFileSync(
    new URL("../../../../lib/db/drizzle/0016_preserve_existing_auto_close.sql", import.meta.url),
    "utf8",
  );

  it("carries existing close duration and message into the closure stage", () => {
    expect(migration).toContain('"auto_close_after_minutes" =');
    expect(migration).toContain('"auto_close_message" = "closing_message"');
    expect(migration).toContain('"warning_after_minutes" =');
  });

  it("repairs databases that already applied the first version of the migration", () => {
    expect(repair).toContain(
      '"auto_close_after_minutes" = "warning_after_minutes"',
    );
    expect(repair).toContain(
      '"auto_close_message" = "warning_message"',
    );
  });
});

describe("conversation settings input", () => {
  it("accepts warning and later automatic close settings", () => {
    const parsed = UpdateAgentConversationSettingsBody.safeParse({
      warningAfterMinutes: 30,
      warningMessage: "Still there?",
      autoCloseAfterMinutes: 60,
      autoCloseMessage: "Closing now.",
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
        warningAfterMinutes: 527040,
        warningMessage: "",
        autoCloseAfterMinutes: 0,
        autoCloseMessage: "",
        welcomeMessage,
        escalationMessage: "Sorry {user_name}, I cannot answer that.",
      }).success,
    ).toBe(false);
    expect(
      UpdateAgentConversationSettingsBody.safeParse({
        warningAfterMinutes: 0,
        warningMessage: "",
        autoCloseAfterMinutes: -1,
        autoCloseMessage: "",
        welcomeMessage,
        escalationMessage: "Sorry {user_name}, I cannot answer that.",
      }).success,
    ).toBe(false);
  });

  it("requires the close timer to be later than the warning timer", () => {
    expect(
      isValidInactivitySettings({
        warningAfterMinutes: 30,
        autoCloseAfterMinutes: 30,
      }),
    ).toBe(false);
    expect(
      isValidInactivitySettings({
        warningAfterMinutes: 30,
        autoCloseAfterMinutes: 29,
      }),
    ).toBe(false);
    expect(
      isValidInactivitySettings({
        warningAfterMinutes: 30,
        autoCloseAfterMinutes: 60,
      }),
    ).toBe(true);
    expect(
      isValidInactivitySettings({
        warningAfterMinutes: 0,
        autoCloseAfterMinutes: 30,
      }),
    ).toBe(true);
  });
});

describe("conversation rating input", () => {
  it("accepts only positive or negative ratings", () => {
    expect(
      SubmitConversationRatingBody.safeParse({ rating: "positive" }).success,
    ).toBe(true);
    expect(
      SubmitConversationRatingBody.safeParse({ rating: "negative" }).success,
    ).toBe(true);
    expect(
      SubmitConversationRatingBody.safeParse({ rating: "neutral" }).success,
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
