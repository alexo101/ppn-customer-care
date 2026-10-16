import { describe, expect, it, vi } from "vitest";
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
  it("translates using the agent language and preserves the user placeholder", async () => {
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
      "Lo siento {user_name}, no puedo responder a eso. (es)",
    );
  });

  it("uses a localized safe template when translation loses the placeholder", async () => {
    const template = "Welcome {user_name}.";
    const translator = {
      translate: async () => "Lo siento, no puedo responder a eso.",
    };

    await expect(
      translateEscalationTemplate(template, ["es"], translator),
    ).resolves.toBe(
      "Lo siento, {user_name}, no puedo responder a eso. ¿Quieres que te ponga en contacto con un agente de soporte?",
    );
  });

  it("preserves configured English wording without calling the translator", async () => {
    const template = "Welcome {user_name}.";
    const translate = vi.fn(async () => "unexpected");
    const translator = { translate };

    await expect(
      translateEscalationTemplate(template, [], translator),
    ).resolves.toBe(template);
    expect(translate).not.toHaveBeenCalled();
  });

  it("uses the localized default when no escalation template is configured", async () => {
    const translate = vi.fn(async () => "unexpected");

    await expect(
      translateEscalationTemplate("", ["es"], { translate }),
    ).resolves.toContain("agente de soporte");
    expect(translate).not.toHaveBeenCalled();
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
