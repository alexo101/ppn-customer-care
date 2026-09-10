import type { InboxEscalationStatus } from "@workspace/api-client-react";

export const INBOX_STATUS_TABS = [
  "open",
  "in_progress",
  "waiting_on_customer",
  "resolved",
  "all",
] as const;

export type InboxStatusTab = (typeof INBOX_STATUS_TABS)[number];

export const INBOX_STATUS_LABELS: Record<InboxEscalationStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting on customer",
  resolved: "Resolved",
};

export const INBOX_STATUS_TAB_LABELS: Record<InboxStatusTab, string> = {
  ...INBOX_STATUS_LABELS,
  all: "All",
};

export function isActiveInboxStatus(status: string) {
  return status !== "resolved";
}

export function inboxStatusDotClass(status: string) {
  switch (status) {
    case "open":
      return "bg-red-500";
    case "in_progress":
      return "bg-blue-500";
    case "waiting_on_customer":
      return "bg-amber-500";
    case "resolved":
      return "bg-emerald-500";
    default:
      return "bg-muted-foreground";
  }
}
