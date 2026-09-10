import { describe, expect, it } from "vitest";
import type { InboxEscalation } from "@workspace/api-client-react";
import {
  countInboxByStatus,
  filterInboxEscalations,
  sortInboxEscalations,
  uniqueInboxCategories,
} from "./inbox-filters";
import {
  assigneeDisplayName,
  customerDisplayName,
  escalationCode,
  formatWaitingDuration,
  initialsFromName,
} from "./inbox-format";
import { customerContextFields } from "./inbox-context";
import { isActiveInboxStatus } from "./inbox-status";

function escalation(
  overrides: Partial<InboxEscalation> = {},
): InboxEscalation {
  return {
    id: "esc-1",
    conversationId: "11111111-2222-3333-4444-555555556789",
    agentId: "agent-1",
    agentName: "AppPro Support",
    teamName: "Customer Care B2B",
    status: "open",
    priority: "normal",
    reason: "The visitor requested escalation after an unanswered question.",
    category: "Billing",
    subcategory: "Automatic transactions",
    retrievedInformation: [],
    previousAnswer: "",
    context: { userQuestion: "Slack channel?", locale: "es" },
    isRead: true,
    assignmentState: "unassigned",
    assigneeMemberId: null,
    assigneeName: null,
    claimedAt: null,
    customerName: "Alejandro Otero",
    customerEmail: "alejandro.otero@papernest.com",
    lastMessagePreview: "Need help",
    lastActivityAt: "2026-09-10T10:00:00.000Z",
    createdAt: "2026-09-10T09:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
    aiSummary: null,
    aiSummaryGeneratedAt: null,
    ...overrides,
  };
}

describe("inbox list helpers", () => {
  it("filters by status, category, and search", () => {
    const items = [
      escalation(),
      escalation({
        id: "esc-2",
        status: "resolved",
        category: "Refunds",
        customerName: "Marta Ruiz",
        reason: "Refund above the automatic approval limit.",
      }),
    ];
    expect(
      filterInboxEscalations(items, {
        status: "open",
        search: "",
        category: null,
      }).map((item) => item.id),
    ).toEqual(["esc-1"]);
    expect(
      filterInboxEscalations(items, {
        status: "all",
        search: "marta",
        category: null,
      }).map((item) => item.id),
    ).toEqual(["esc-2"]);
    expect(
      filterInboxEscalations(items, {
        status: "all",
        search: "",
        category: "Refunds",
      }).map((item) => item.id),
    ).toEqual(["esc-2"]);
  });

  it("sorts longest waiting first", () => {
    const items = [
      escalation({ id: "newer", lastActivityAt: "2026-09-10T12:00:00.000Z" }),
      escalation({ id: "older", lastActivityAt: "2026-09-10T08:00:00.000Z" }),
    ];
    expect(
      sortInboxEscalations(items, "longest_waiting").map((item) => item.id),
    ).toEqual(["older", "newer"]);
    expect(sortInboxEscalations(items, "recent").map((item) => item.id)).toEqual(
      ["newer", "older"],
    );
  });

  it("counts statuses and unique categories", () => {
    const items = [
      escalation(),
      escalation({ id: "esc-2", status: "in_progress", category: "Refunds" }),
      escalation({ id: "esc-3", status: "resolved", category: "Billing" }),
    ];
    expect(countInboxByStatus(items)).toEqual({
      open: 1,
      in_progress: 1,
      waiting_on_customer: 0,
      resolved: 1,
      all: 3,
    });
    expect(uniqueInboxCategories(items)).toEqual(["Billing", "Refunds"]);
  });
});

describe("inbox formatting", () => {
  it("formats compact waiting durations", () => {
    const now = Date.parse("2026-09-10T12:00:00.000Z");
    expect(formatWaitingDuration("2026-09-10T11:43:00.000Z", now)).toBe("17m");
    expect(formatWaitingDuration("2026-09-09T19:00:00.000Z", now)).toBe("17h");
    expect(formatWaitingDuration("2026-09-08T12:00:00.000Z", now)).toBe("2d");
  });

  it("builds customer identity helpers", () => {
    expect(initialsFromName("Alejandro Otero")).toBe("AO");
    expect(customerDisplayName(escalation())).toBe("Alejandro Otero");
    expect(
      customerDisplayName({
        customerName: null,
        customerEmail: "alex.moreno@example.com",
      }),
    ).toBe("Alex Moreno");
    expect(assigneeDisplayName("alex.moreno@example.com")).toBe("Alex Moreno");
    expect(escalationCode("11111111-2222-3333-4444-555555556789")).toBe(
      "ESC-6789",
    );
    expect(isActiveInboxStatus("open")).toBe(true);
    expect(isActiveInboxStatus("resolved")).toBe(false);
  });

  it("exposes extra customer context without duplicating identity fields", () => {
    expect(
      customerContextFields({
        email: "hidden@example.com",
        userQuestion: "hidden",
        locale: "es",
        accountId: "A-1",
      }),
    ).toEqual([
      { key: "locale", label: "Locale", value: "es" },
      { key: "accountId", label: "Account Id", value: "A-1" },
    ]);
  });
});
