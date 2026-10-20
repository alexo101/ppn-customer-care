import { describe, expect, it } from "vitest";
import {
  isAutoClosedConversation,
  MAX_AUTO_CLOSE_MINUTES,
  splitAutoCloseTotalMinutes,
  toAutoCloseTotalMinutes,
} from "./conversation-settings";

describe("isAutoClosedConversation", () => {
  it("is true only when metadata.autoClosed is true", () => {
    expect(isAutoClosedConversation({ autoClosed: true })).toBe(true);
    expect(isAutoClosedConversation({ autoClosed: false })).toBe(false);
    expect(isAutoClosedConversation({})).toBe(false);
    expect(isAutoClosedConversation(null)).toBe(false);
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
