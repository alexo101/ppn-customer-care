import { describe, expect, it } from "vitest";
import {
  isEscalationOfferMessage,
  latestEscalationOffer,
} from "./conversation-actions";

const offer = {
  id: "assistant-1",
  sender: "assistant",
  metadata: { kind: "unable_to_answer", actions: ["escalate"] },
};

describe("conversation escalation actions", () => {
  it("recognizes only actionable unable-to-answer messages", () => {
    expect(isEscalationOfferMessage(offer)).toBe(true);
    expect(
      isEscalationOfferMessage({
        ...offer,
        metadata: { kind: "clarification", actions: [] },
      }),
    ).toBe(false);
  });

  it("returns the latest offer and clears it after another question", () => {
    const messages = [
      offer,
      { id: "user-1", sender: "user", metadata: {} },
      { id: "assistant-2", sender: "assistant", metadata: {} },
    ];
    expect(latestEscalationOffer(messages)?.id).toBe("assistant-1");
    expect(latestEscalationOffer(messages, "assistant-1")).toBeUndefined();
    expect(
      latestEscalationOffer(
        [
          ...messages,
          {
            id: "assistant-3",
            sender: "assistant",
            metadata: { kind: "unable_to_answer", actions: ["escalate"] },
          },
        ],
        "assistant-1",
      )?.id,
    ).toBe("assistant-3");
  });
});
