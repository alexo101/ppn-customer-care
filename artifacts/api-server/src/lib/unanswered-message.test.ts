import { describe, expect, it } from "vitest";
import {
  ESCALATE_MESSAGE_ACTION,
  interpolateEscalationMessage,
  isUnableToAnswerMessageMetadata,
  UNABLE_TO_ANSWER_MESSAGE_KIND,
} from "./unanswered-message";

describe("interpolateEscalationMessage", () => {
  it("replaces the visitor placeholder and falls back to there", () => {
    expect(
      interpolateEscalationMessage(
        "Sorry {user_name}, I cannot answer that.",
        "Ada",
      ),
    ).toBe("Sorry Ada, I cannot answer that.");
    expect(
      interpolateEscalationMessage(
        "Sorry {user_name}, I cannot answer that.",
        "",
      ),
    ).toBe("Sorry there, I cannot answer that.");
  });
});

describe("isUnableToAnswerMessageMetadata", () => {
  it("recognizes an actionable unable-to-answer message", () => {
    expect(
      isUnableToAnswerMessageMetadata({
        kind: UNABLE_TO_ANSWER_MESSAGE_KIND,
        actions: [ESCALATE_MESSAGE_ACTION],
      }),
    ).toBe(true);
    expect(
      isUnableToAnswerMessageMetadata({
        kind: UNABLE_TO_ANSWER_MESSAGE_KIND,
        actions: [],
      }),
    ).toBe(false);
  });
});
