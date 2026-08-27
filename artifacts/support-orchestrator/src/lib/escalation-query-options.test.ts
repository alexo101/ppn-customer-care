import { describe, expect, it } from "vitest";
import {
  getAgentEscalationQueryOptions,
  getInboxEscalationsQueryOptions,
  getInboxUnreadCountQueryOptions,
} from "./escalation-query-options";

describe("escalation query options", () => {
  it("disables exponential retries for agent settings", () => {
    expect(getAgentEscalationQueryOptions("agent-1")).toMatchObject({
      queryKey: ["/api/agents/agent-1/escalation"],
      retry: false,
    });
  });

  it("keeps inbox polling fail-fast", () => {
    expect(getInboxEscalationsQueryOptions("open")).toMatchObject({
      queryKey: ["/api/inbox/escalations", { status: "open" }],
      refetchInterval: 10000,
      retry: false,
    });
    expect(getInboxUnreadCountQueryOptions()).toMatchObject({
      queryKey: ["/api/inbox/escalations/unread-count"],
      refetchInterval: 10000,
      retry: false,
    });
  });
});