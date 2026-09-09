import { describe, expect, it } from "vitest";
import {
  ESCALATE_MESSAGE_ACTION,
  buildUnableToAnswerResponse,
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

describe("buildUnableToAnswerResponse", () => {
  it("uses the configured message and preserves the escalation action", () => {
    expect(
      buildUnableToAnswerResponse(
        "Sorry {user_name}, please escalate this.",
        "Ada",
      ),
    ).toEqual({
      responseText: "Sorry Ada, please escalate this.",
      metadata: {
        citations: [],
        kind: UNABLE_TO_ANSWER_MESSAGE_KIND,
        actions: [ESCALATE_MESSAGE_ACTION],
      },
      resolutionStatus: "pending_clarification",
      shouldAskResolution: false,
    });
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
