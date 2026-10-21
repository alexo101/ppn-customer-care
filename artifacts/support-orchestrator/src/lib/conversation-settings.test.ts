import { describe, expect, it } from "vitest";
import {
  hasInactivityWarning,
  isAutoClosedConversation,
  latestInactivityWarningMessageId,
  MAX_AUTO_CLOSE_MINUTES,
  splitAutoCloseTotalMinutes,
  toAutoCloseTotalMinutes,
} from "./conversation-settings";
import { agentLanguageCopy } from "./agent-language";

describe("isAutoClosedConversation", () => {
  it("is true only when metadata.autoClosed is true", () => {
    expect(isAutoClosedConversation({ autoClosed: true })).toBe(true);
    expect(isAutoClosedConversation({ autoClosed: false })).toBe(false);
    expect(isAutoClosedConversation({})).toBe(false);
    expect(isAutoClosedConversation(null)).toBe(false);
  });
});

describe("inactivity warning rating association", () => {
  it("requires a recorded warning timestamp", () => {
    expect(hasInactivityWarning({ inactivityWarningFor: "2026-10-21T10:00:00Z" })).toBe(true);
    expect(hasInactivityWarning({ inactivityWarningFor: "" })).toBe(false);
    expect(hasInactivityWarning({ autoCloseFeedback: true })).toBe(false);
    expect(hasInactivityWarning(null)).toBe(false);
  });

  it("associates one rating prompt with only the latest warning", () => {
    expect(
      latestInactivityWarningMessageId([
        { id: "message-1", metadata: { kind: "inactivity_warning" } },
        { id: "message-2", metadata: { kind: "auto_close" } },
        { id: "message-3", metadata: { kind: "inactivity_warning" } },
      ]),
    ).toBe("message-3");
    expect(
      latestInactivityWarningMessageId([
        { id: "message-1", metadata: { kind: "auto_close" } },
      ]),
    ).toBeNull();
  });
});

describe("localized conversation rating question", () => {
  it("uses the configured agent language rather than browser language", () => {
    expect(agentLanguageCopy("en", "conversationRatingQuestion")).toBe(
      "Have we resolved your request?",
    );
    expect(agentLanguageCopy("es", "conversationRatingQuestion")).toBe(
      "¿Hemos resuelto tu consulta?",
    );
    expect(agentLanguageCopy("fr", "conversationRatingQuestion")).toBe(
      "Avons-nous résolu votre demande ?",
    );
    expect(agentLanguageCopy("it", "conversationRatingQuestion")).toBe(
      "Abbiamo risolto la tua richiesta?",
    );
  });
});

describe("auto-close duration minutes", () => {
  it("shows the saved days and hours as one total minute value", () => {
    expect(toAutoCloseTotalMinutes(1, 2, 30)).toBe(1590);
    expect(toAutoCloseTotalMinutes(0, 1, 0)).toBe(60);
  });

  it("saves total minutes in the API's days, hours, and minutes fields", () => {
    expect(splitAutoCloseTotalMinutes(1590)).toEqual({
      autoCloseDays: 1,
      autoCloseHours: 2,
      autoCloseMinutes: 30,
    });
    expect(splitAutoCloseTotalMinutes(0)).toEqual({
      autoCloseDays: 0,
      autoCloseHours: 0,
      autoCloseMinutes: 0,
    });
  });

  it("bounds the single field to the supported maximum duration", () => {
    expect(splitAutoCloseTotalMinutes(MAX_AUTO_CLOSE_MINUTES)).toEqual({
      autoCloseDays: 365,
      autoCloseHours: 23,
      autoCloseMinutes: 59,
    });
    expect(splitAutoCloseTotalMinutes(MAX_AUTO_CLOSE_MINUTES + 1)).toEqual({
      autoCloseDays: 365,
      autoCloseHours: 23,
      autoCloseMinutes: 59,
    });
  });
});
