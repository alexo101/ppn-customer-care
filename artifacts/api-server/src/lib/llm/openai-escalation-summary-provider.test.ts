import { describe, expect, it } from "vitest";
import {
  formatEscalationSummary,
  storedEscalationSummary,
} from "./escalation-summary-provider";
import { parseEscalationSummaryResponse } from "./openai-escalation-summary-provider";

describe("escalation summary formatting", () => {
  it("joins the three briefing parts", () => {
    expect(
      formatEscalationSummary({
        customerRequest: "Needs the B2B Slack channel.",
        whatAiTried: "Could not answer after searching billing staff.",
        suggestedNextStep: "Share the B2B Slack channel with the visitor.",
      }),
    ).toBe(
      [
        "Request: Needs the B2B Slack channel.",
        "What the agent tried: Could not answer after searching billing staff.",
        "Suggested next step: Share the B2B Slack channel with the visitor.",
      ].join("\n\n"),
    );
  });

  it("treats blank stored summaries as missing so generation can retry", () => {
    expect(storedEscalationSummary(null)).toBeNull();
    expect(storedEscalationSummary("   ")).toBeNull();
    expect(storedEscalationSummary("Request: Refund")).toBe("Request: Refund");
  });
});

describe("parseEscalationSummaryResponse", () => {
  it("reads structured briefing fields", () => {
    expect(
      parseEscalationSummaryResponse(
        JSON.stringify({
          customerRequest: "¿Cuál es el canal de Slack?",
          whatAiTried: "El agente no pudo responder.",
          suggestedNextStep: "Proporcionar el canal de Slack B2B.",
        }),
      ),
    ).toEqual({
      customerRequest: "¿Cuál es el canal de Slack?",
      whatAiTried: "El agente no pudo responder.",
      suggestedNextStep: "Proporcionar el canal de Slack B2B.",
    });
  });

  it("returns empty parts for malformed provider output", () => {
    expect(parseEscalationSummaryResponse("not json")).toEqual({
      customerRequest: "",
      whatAiTried: "",
      suggestedNextStep: "",
    });
  });
});
