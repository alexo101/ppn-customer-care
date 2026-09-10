import { ChevronRight, Clock } from "lucide-react";
import type { InboxEscalation, InboxEscalationStatus } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  assigneeDisplayName,
  avatarToneClass,
  customerDisplayName,
  escalationCode,
  formatWaitingDuration,
  initialsFromName,
} from "@/lib/inbox-format";
import { InboxStatusSelect } from "@/components/inbox/inbox-status-select";
import { Skeleton } from "@/components/ui/skeleton";

export function InboxEscalationTable({
  items,
  isLoading,
  visibleCount,
  totalCount,
  onOpen,
  onStatusChange,
}: {
  items: InboxEscalation[];
  isLoading?: boolean;
  visibleCount: number;
  totalCount: number;
  onOpen: (escalation: InboxEscalation) => void;
  onStatusChange: (
    escalation: InboxEscalation,
    status: InboxEscalationStatus,
  ) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <p className="px-1 pb-3 text-xs text-muted-foreground">
        Showing {visibleCount} of {totalCount} escalations
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Escalation</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Waiting</th>
              <th className="px-4 py-3 font-medium">Assignee</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={index} className="border-b border-border last:border-0">
                  <td className="px-4 py-3" colSpan={7}>
                    <Skeleton className="h-10 w-full" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-16 text-center text-sm text-muted-foreground"
                >
                  No escalations match the current filters.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const name = customerDisplayName(item);
                const assignee = assigneeDisplayName(item.assigneeName);
                return (
                  <tr
                    key={item.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                    onClick={() => onOpen(item)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                            avatarToneClass(name),
                          )}
                        >
                          {initialsFromName(name)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">{name}</p>
                            {!item.isRead && item.status !== "resolved" ? (
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                                aria-label="Unread"
                              />
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {escalationCode(item.conversationId)} · {item.teamName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[18rem] px-4 py-3">
                      <p className="line-clamp-2 text-sm">
                        {item.reason || item.lastMessagePreview || "Support request"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm">{item.category || "Support"}</p>
                      {item.subcategory ? (
                        <p className="text-xs text-muted-foreground">
                          {item.subcategory}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatWaitingDuration(item.lastActivityAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.assigneeName ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
                              avatarToneClass(assignee),
                            )}
                          >
                            {initialsFromName(assignee)}
                          </span>
                          <span className="truncate text-sm">{assignee}</span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <InboxStatusSelect
                        value={item.status}
                        onValueChange={(status) => onStatusChange(item, status)}
                      />
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
