import { describe, expect, it } from "vitest";
import {
  autoCloseDurationMs,
  isAutoClosed,
  nextAutoCloseAction,
  npsSubmitError,
  withAutoClosed,
} from "./conversation-auto-close";

const hourAgo = new Date("2026-09-02T15:00:00.000Z");
const now = new Date("2026-09-02T16:00:00.000Z");

const defaultSettings = {
  autoCloseDays: 0,
  autoCloseHours: 1,
  autoCloseMinutes: 0,
  closingMessage: "Thanks, closing now.",
  welcomeMessage:
    "Hello {user_name}, you are speaking {agent_name} Ai Agent. How can I help you?",
};

describe("auto-close duration", () => {
  it("returns zero when every unit is zero", () => {
    expect(
      autoCloseDurationMs({
        autoCloseDays: 0,
        autoCloseHours: 0,
        autoCloseMinutes: 0,
        closingMessage: "",
        welcomeMessage: "",
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
        welcomeMessage: "",
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
        settings: defaultSettings,
        now,
      }),
    ).toBe("skip");
    expect(
      nextAutoCloseAction({
        status: "escalated",
        lastActivityAt: hourAgo,
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
        settings: defaultSettings,
        now,
      }),
    ).toBe("skip");
  });

  it("closes immediately after the idle window", () => {
    expect(
      nextAutoCloseAction({
        status: "active",
        lastActivityAt: hourAgo,
        settings: defaultSettings,
        now,
      }),
    ).toBe("close");
  });
});

describe("auto-close metadata", () => {
  it("marks a conversation as auto-closed and clears leftover confirmation flags", () => {
    const closed = withAutoClosed({
      subject: "Help",
      awaitingAutoCloseConfirmation: true,
      autoClosePromptedAt: now.toISOString(),
    });
    expect(isAutoClosed(closed)).toBe(true);
    expect(closed).toEqual({ subject: "Help", autoClosed: true });
  });
});

describe("npsSubmitError", () => {
  it("returns null when the conversation is missing", () => {
    expect(npsSubmitError(null)).toBeNull();
  });

  it("rejects open conversations", () => {
    expect(
      npsSubmitError({
        status: "active",
        npsScore: null,
        metadata: { autoClosed: true },
      }),
    ).toMatch(/closed/i);
  });

  it("rejects conversations that were not auto-closed", () => {
    expect(
      npsSubmitError({
        status: "closed",
        npsScore: null,
        metadata: {},
      }),
    ).toMatch(/automatic close/i);
  });

  it("rejects a second rating", () => {
    expect(
      npsSubmitError({
        status: "closed",
        npsScore: 8,
        metadata: { autoClosed: true },
      }),
    ).toMatch(/already/i);
  });

  it("allows a first score after automatic close", () => {
    expect(
      npsSubmitError({
        status: "closed",
        npsScore: null,
        metadata: { autoClosed: true },
      }),
    ).toBeNull();
  });
});
