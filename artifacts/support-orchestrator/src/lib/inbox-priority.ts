import type { InboxEscalationPriority } from "@workspace/api-client-react";

export const INBOX_PRIORITIES = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
] as const satisfies readonly InboxEscalationPriority[];

export const INBOX_PRIORITY_LABELS: Record<InboxEscalationPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

export function inboxPriorityTextClass(priority: InboxEscalationPriority) {
  switch (priority) {
    case "urgent":
      return "text-red-600";
    case "high":
      return "text-red-500";
    case "medium":
      return "text-orange-500";
    case "low":
      return "text-amber-500";
    default:
      return "text-muted-foreground";
  }
}
