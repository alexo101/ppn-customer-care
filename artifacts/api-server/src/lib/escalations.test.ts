import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, update } = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const column = (name: string) => name;
  const table = (prefix: string) => ({
    id: column(`${prefix}.id`),
    agentId: column(`${prefix}.agentId`),
    memberId: column(`${prefix}.memberId`),
    status: column(`${prefix}.status`),
    assigneeMemberId: column(`${prefix}.assigneeMemberId`),
    conversationId: column(`${prefix}.conversationId`),
    updatedAt: column(`${prefix}.updatedAt`),
    isRead: column(`${prefix}.isRead`),
    revokedAt: column(`${prefix}.revokedAt`),
  });
  return {
    db: { select, update },
    agentEscalationMembersTable: table("teamMember"),
    agentEscalationSettingsTable: table("settings"),
    agentsTable: table("agent"),
    conversationsTable: table("conversation"),
    escalationAssignmentsTable: table("assignment"),
    escalationsTable: table("escalation"),
    messagesTable: table("message"),
    workspaceMembersTable: table("member"),
  };
});

import {
  claimEscalation,
  escalationStatusPatch,
  inboxTeamLabel,
  matchesAssigneeFilter,
  normalizeInboxPriority,
} from "./escalations";

function queryChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const promise = Promise.resolve(result);
  const self = () => chain;
  chain.from = vi.fn(self);
  chain.innerJoin = vi.fn(self);
  chain.where = vi.fn(self);
  chain.limit = vi.fn(() => promise);
  chain.set = vi.fn(self);
  chain.returning = vi.fn(() => promise);
  return chain;
}

function escalation(assigneeMemberId: string | null = null) {
  return {
    id: "escalation-1",
    conversationId: "conversation-1",
    agentId: "agent-1",
    status: "open",
    assigneeMemberId,
    claimedAt: null,
  };
}

describe("claimEscalation", () => {
  beforeEach(() => {
    select.mockReset();
    update.mockReset();
  });

  it("claims an open escalation atomically for a configured member", async () => {
    const row = escalation();
    select.mockReturnValue(queryChain([{ escalation: row }]));
    update.mockReturnValue(queryChain([{ ...row, assigneeMemberId: "member-1" }]));

    const result = await claimEscalation("escalation-1", "member-1");

    expect(result.assigneeMemberId).toBe("member-1");
    expect(update).toHaveBeenCalledOnce();
  });

  it("is idempotent when the current member already owns it", async () => {
    const row = escalation("member-1");
    select.mockReturnValue(queryChain([{ escalation: row }]));

    const result = await claimEscalation("escalation-1", "member-1");

    expect(result).toBe(row);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an escalation already claimed by another member", async () => {
    select.mockReturnValue(queryChain([{ escalation: escalation("member-2") }]));

    await expect(claimEscalation("escalation-1", "member-1")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("inboxTeamLabel", () => {
  it("uses the configured Team name field", () => {
    expect(inboxTeamLabel("Customer Care France")).toBe("Customer Care France");
  });

  it("falls back to the agent name when the team name is empty or default", () => {
    expect(inboxTeamLabel("", "Billing support")).toBe("Billing support");
    expect(inboxTeamLabel("Escalation team", "Billing support")).toBe("Billing support");
  });

  it("falls back to Escalation team only when both names are empty", () => {
    expect(inboxTeamLabel("")).toBe("Escalation team");
    expect(inboxTeamLabel("  ")).toBe("Escalation team");
  });
});

describe("escalation status workflow", () => {
  it("resolves the conversation when the inbox status is resolved", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    expect(escalationStatusPatch("resolved", now)).toEqual({
      escalation: { status: "resolved", resolvedAt: now, updatedAt: now },
      conversation: {
        status: "resolved",
        resolvedAt: now,
        lastActivityAt: now,
      },
    });
  });

  it("reopens the conversation as escalated for any non-resolved status", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    expect(escalationStatusPatch("in_progress", now)).toEqual({
      escalation: { status: "in_progress", resolvedAt: null, updatedAt: now },
      conversation: {
        status: "escalated",
        resolvedAt: null,
        lastActivityAt: now,
      },
    });
  });

  it("filters assignee scopes for everyone, mine, and unassigned", () => {
    expect(matchesAssigneeFilter("member-1", "member-1", "everyone")).toBe(true);
    expect(matchesAssigneeFilter("member-2", "member-1", "everyone")).toBe(true);
    expect(matchesAssigneeFilter(null, "member-1", "everyone")).toBe(true);
    expect(matchesAssigneeFilter("member-1", "member-1", "mine")).toBe(true);
    expect(matchesAssigneeFilter("member-2", "member-1", "mine")).toBe(false);
    expect(matchesAssigneeFilter(null, "member-1", "unassigned")).toBe(true);
    expect(matchesAssigneeFilter("member-1", "member-1", "unassigned")).toBe(
      false,
    );
  });
});

describe("inbox priority", () => {
  it("treats missing, unknown, and legacy normal values as no priority", () => {
    expect(normalizeInboxPriority("none")).toBe("none");
    expect(normalizeInboxPriority("normal")).toBe("none");
    expect(normalizeInboxPriority("")).toBe("none");
    expect(normalizeInboxPriority("urgent")).toBe("urgent");
    expect(normalizeInboxPriority("medium")).toBe("medium");
  });
});
