import { describe, expect, it } from "vitest";
import { isAutoClosedConversation } from "./conversation-settings";

describe("isAutoClosedConversation", () => {
  it("is true only when metadata.autoClosed is true", () => {
    expect(isAutoClosedConversation({ autoClosed: true })).toBe(true);
    expect(isAutoClosedConversation({ autoClosed: false })).toBe(false);
    expect(isAutoClosedConversation({})).toBe(false);
    expect(isAutoClosedConversation(null)).toBe(false);
  });
});
