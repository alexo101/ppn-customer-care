import type { InboxEscalation } from "@workspace/api-client-react";

export function replaceInboxEscalation(
  items: InboxEscalation[] | undefined,
  updated: InboxEscalation,
): InboxEscalation[] | undefined {
  if (!items) return items;

  return items.map((item) => (item.id === updated.id ? updated : item));
}