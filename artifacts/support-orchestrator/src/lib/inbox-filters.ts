import type { InboxEscalation, InboxEscalationPriority } from "@workspace/api-client-react";
import type { InboxStatusTab } from "./inbox-status";

export type InboxSort = "longest_waiting" | "recent";

export function filterInboxEscalations(
  items: InboxEscalation[],
  options: {
    status: InboxStatusTab;
    search: string;
    category: string | null;
    priority: InboxEscalationPriority | null;
  },
) {
  const query = options.search.trim().toLowerCase();
  return items.filter((item) => {
    if (options.status !== "all" && item.status !== options.status) return false;
    if (options.category && (item.category || "Support") !== options.category) {
      return false;
    }
    if (options.priority && item.priority !== options.priority) return false;
    if (!query) return true;
    const haystack = [
      item.customerName,
      item.customerEmail,
      item.lastMessagePreview,
      item.reason,
      item.category,
      item.subcategory,
      item.conversationId,
      item.teamName,
      item.agentName,
      item.id,
      item.assigneeName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function sortInboxEscalations(
  items: InboxEscalation[],
  sort: InboxSort,
) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.lastActivityAt).getTime();
    const rightTime = new Date(right.lastActivityAt).getTime();
    return sort === "longest_waiting"
      ? leftTime - rightTime
      : rightTime - leftTime;
  });
}

export function uniqueInboxCategories(items: InboxEscalation[]) {
  return [
    ...new Set(items.map((item) => item.category.trim() || "Support")),
  ].sort((left, right) => left.localeCompare(right));
}

export function countInboxByStatus(items: InboxEscalation[]) {
  return {
    open: items.filter((item) => item.status === "open").length,
    in_progress: items.filter((item) => item.status === "in_progress").length,
    waiting_on_customer: items.filter(
      (item) => item.status === "waiting_on_customer",
    ).length,
    resolved: items.filter((item) => item.status === "resolved").length,
    all: items.length,
  };
}
