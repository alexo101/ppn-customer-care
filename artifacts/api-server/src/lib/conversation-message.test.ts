import { describe, expect, it } from "vitest";
import { toPublicMessage } from "./conversation-message";

describe("customer-facing message serialization", () => {
  it("removes internal diagnostics from message history and send responses", () => {
    const message = toPublicMessage({
      id: "message-1",
      conversationId: "conversation-1",
      sender: "assistant",
      content: "I could not find enough information.",
      metadata: {
        kind: "unable_to_answer",
        actions: ["escalate"],
        diagnostics: { outcome: "model_declined" },
        internalDiagnostics: { outcome: "all_grounded_claims_rejected" },
        answer_diagnostics: { outcome: "invalid_structured_output" },
      },
      createdAt: new Date("2026-10-20T12:00:00.000Z"),
    });

    expect(message.metadata).toEqual({
      kind: "unable_to_answer",
      actions: ["escalate"],
    });
    expect(JSON.stringify(message)).not.toMatch(
      /model_declined|all_grounded_claims_rejected|invalid_structured_output/,
    );
  });
});
