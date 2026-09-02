import { describe, expect, it } from "vitest";
import {
  AGENT_CONFIG_STEPS,
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

describe("agent conversation settings configuration routing", () => {
  it("places Conversation Settings between Escalations and Training", () => {
    expect(isAgentConfigStep("conversation-settings")).toBe(true);
    expect(agentConfigHref("agent-1", "conversation-settings")).toBe(
      "/agents/agent-1/conversation-settings",
    );
    expect(
      parseAgentConfigLocation("/agents/agent-1/conversation-settings"),
    ).toEqual({
      agentId: "agent-1",
      step: "conversation-settings",
    });
    const ids = AGENT_CONFIG_STEPS.map((step) => step.id);
    expect(ids.indexOf("conversation-settings")).toBe(
      ids.indexOf("escalations") + 1,
    );
    expect(ids.indexOf("training")).toBe(
      ids.indexOf("conversation-settings") + 1,
    );
  });
});
