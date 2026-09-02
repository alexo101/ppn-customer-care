import { describe, expect, it } from "vitest";
import {
  autoCloseDurationMs,
  clearAutoCloseConfirmation,
  isAwaitingAutoCloseConfirmation,
  nextAutoCloseAction,
  withAutoCloseConfirmation,
} from "./conversation-auto-close";

const hourAgo = new Date("2026-09-02T15:00:00.000Z");
const now = new Date("2026-09-02T16:00:00.000Z");

const defaultSettings = {
  autoCloseDays: 0,
  autoCloseHours: 1,
  autoCloseMinutes: 0,
  closingMessage: "Thanks, closing now.",
  askIfResolved: true,
};

describe("auto-close duration", () => {
  it("returns zero when every unit is zero", () => {
    expect(
      autoCloseDurationMs({
        autoCloseDays: 0,
        autoCloseHours: 0,
        autoCloseMinutes: 0,
        closingMessage: "",
        askIfResolved: true,
      }),
    ).toBe(0);
  });

  it("combines days, hours, and minutes", () => {
    expect(
      autoCloseDurationMs({
        autoCloseDays: 1,
        autoCloseHours: 2,
        autoCloseMinutes: 30,
        closingMessage: "",
        askIfResolved: true,
      }),
    ).toBe(((24 + 2) * 60 + 30) * 60 * 1000);
  });
});

describe("nextAutoCloseAction", () => {
  it("skips closed and escalated conversations", () => {
    expect(
      nextAutoCloseAction({
        status: "closed",
        lastActivityAt: hourAgo,
        metadata: {},
        settings: defaultSettings,
        now,
      }),
    ).toBe("skip");
    expect(
      nextAutoCloseAction({
        status: "escalated",
        lastActivityAt: hourAgo,
        metadata: {},
        settings: defaultSettings,
        now,
      }),
    ).toBe("skip");
  });

  it("skips when the configured duration is zero", () => {
    expect(
      nextAutoCloseAction({
        status: "active",
        lastActivityAt: hourAgo,
        metadata: {},
        settings: { ...defaultSettings, autoCloseHours: 0 },
        now,
      }),
    ).toBe("skip");
  });

  it("skips when the conversation is still inside the idle window", () => {
    expect(
      nextAutoCloseAction({
        status: "active",
        lastActivityAt: new Date("2026-09-02T15:30:00.000Z"),
        metadata: {},
        settings: defaultSettings,
        now,
      }),
    ).toBe("skip");
  });

  it("prompts first when ask-if-resolved is enabled", () => {
    expect(
      nextAutoCloseAction({
        status: "active",
        lastActivityAt: hourAgo,
        metadata: {},
        settings: defaultSettings,
        now,
      }),
    ).toBe("prompt");
  });

  it("closes on the second idle after a prompt", () => {
    expect(
      nextAutoCloseAction({
        status: "active",
        lastActivityAt: hourAgo,
        metadata: { awaitingAutoCloseConfirmation: true },
        settings: defaultSettings,
        now,
      }),
    ).toBe("close");
  });

  it("closes immediately when ask-if-resolved is off", () => {
    expect(
      nextAutoCloseAction({
        status: "active",
        lastActivityAt: hourAgo,
        metadata: {},
        settings: { ...defaultSettings, askIfResolved: false },
        now,
      }),
    ).toBe("close");
  });
});

describe("auto-close confirmation metadata", () => {
  it("sets and clears the pending confirmation flag", () => {
    const prompted = withAutoCloseConfirmation({ subject: "Help" }, now);
    expect(isAwaitingAutoCloseConfirmation(prompted)).toBe(true);
    expect(prompted.autoClosePromptedAt).toBe(now.toISOString());
    expect(clearAutoCloseConfirmation(prompted)).toEqual({ subject: "Help" });
  });
});
