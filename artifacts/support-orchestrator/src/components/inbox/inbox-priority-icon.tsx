import { cn } from "@/lib/utils";
import type { InboxEscalationPriority } from "@workspace/api-client-react";
import { inboxPriorityTextClass } from "@/lib/inbox-priority";

export function InboxPriorityIcon({
  priority,
  className,
}: {
  priority: InboxEscalationPriority;
  className?: string;
}) {
  const color = inboxPriorityTextClass(priority);
  if (priority === "urgent") {
    return (
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white",
          className,
        )}
        aria-hidden
      >
        !
      </span>
    );
  }
  const filled =
    priority === "high" ? 4 : priority === "medium" ? 3 : priority === "low" ? 2 : 0;
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("h-4 w-4", color, className)}
      aria-hidden
    >
      {[0, 1, 2, 3].map((index) => {
        const active = index < filled;
        return (
          <rect
            key={index}
            x={2 + index * 3.2}
            y={11 - index * 2.4}
            width="2.2"
            height={3 + index * 2.4}
            rx="0.6"
            className={active ? "fill-current" : "fill-current opacity-25"}
          />
        );
      })}
    </svg>
  );
}
