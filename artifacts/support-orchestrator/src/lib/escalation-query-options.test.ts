import { describe, expect, it } from "vitest";
import {
  getAgentEscalationQueryOptions,
  getInboxEscalationsQueryOptions,
  getInboxMessagesQueryOptions,
  getInboxTeamsQueryOptions,
  getInboxUnreadCountQueryOptions,
  getTeamEscalationsQueryOptions,
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
    expect(getInboxTeamsQueryOptions()).toMatchObject({
      queryKey: ["/api/inbox/teams"],
      refetchInterval: 10000,
      retry: false,
    });
  });

  it("keeps team queues independently cacheable and polled", () => {
    expect(getTeamEscalationsQueryOptions("agent-1", "open")).toMatchObject({
      queryKey: ["/api/inbox/team-escalations", { agentId: "agent-1", status: "open" }],
      refetchInterval: 10000,
      retry: false,
    });
  });

  it("polls messages only while an escalation is open", () => {
    expect(getInboxMessagesQueryOptions("conversation-1", true)).toMatchObject({
      queryKey: ["/api/conversations/conversation-1/messages"],
      refetchInterval: 5000,
      retry: false,
    });
    expect(getInboxMessagesQueryOptions("conversation-1", false)).toMatchObject({
      refetchInterval: false,
    });
  });
});