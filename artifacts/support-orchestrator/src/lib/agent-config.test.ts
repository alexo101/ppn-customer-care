import { describe, expect, it } from "vitest";
import {
  agentConfigHref,
  isAgentConfigStep,
  parseAgentConfigLocation,
} from "./agent-config";

describe("agent escalation configuration routing", () => {
  it("recognizes the Escalations section", () => {
    expect(isAgentConfigStep("escalations")).toBe(true);
    expect(agentConfigHref("agent-1", "escalations")).toBe(
      "/agents/agent-1/escalations",
    );
    expect(parseAgentConfigLocation("/agents/agent-1/escalations")).toEqual({
      agentId: "agent-1",
      step: "escalations",
    });
  });
});
