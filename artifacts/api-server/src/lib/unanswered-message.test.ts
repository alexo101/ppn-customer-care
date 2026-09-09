import { describe, expect, it } from "vitest";
import {
  ESCALATE_MESSAGE_ACTION,
  buildUnableToAnswerResponse,
  interpolateEscalationMessage,
  isUnableToAnswerMessageMetadata,
  translateEscalationTemplate,
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

describe("translateEscalationTemplate", () => {
  it("translates using the reply language and preserves the user placeholder", async () => {
    const translator = {
      translate: async (_template: string, locale: string) =>
        `Lo siento {user_name}, no puedo responder a eso. (${locale})`,
    };

    await expect(
      translateEscalationTemplate(
        "Sorry {user_name}, I cannot answer that.",
        ["es-ES"],
        translator,
      ),
    ).resolves.toBe(
      "Lo siento {user_name}, no puedo responder a eso. (es-es)",
    );
  });

  it("keeps the configured template when translation loses the placeholder", async () => {
    const template = "Sorry {user_name}, I cannot answer that.";
    const translator = {
      translate: async () => "Lo siento, no puedo responder a eso.",
    };

    await expect(
      translateEscalationTemplate(template, ["es"], translator),
    ).resolves.toBe(template);
  });

  it("does not translate when no reply language is available", async () => {
    const template = "Sorry {user_name}, I cannot answer that.";
    const translator = { translate: async () => "unexpected" };

    await expect(
      translateEscalationTemplate(template, [], translator),
    ).resolves.toBe(template);
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
