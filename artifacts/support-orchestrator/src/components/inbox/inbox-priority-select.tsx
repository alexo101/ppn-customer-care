import type { InboxEscalationPriority } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  INBOX_PRIORITIES,
  INBOX_PRIORITY_LABELS,
  inboxPriorityTextClass,
} from "@/lib/inbox-priority";
import { InboxPriorityIcon } from "@/components/inbox/inbox-priority-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function InboxPrioritySelect({
  value,
  disabled,
  onValueChange,
  className,
  compact = false,
}: {
  value: InboxEscalationPriority;
  disabled?: boolean;
  onValueChange: (priority: InboxEscalationPriority) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next as InboxEscalationPriority)}
    >
      <SelectTrigger
        aria-label="Escalation priority"
        className={cn(
          "h-8 gap-2 border-border bg-background px-2 text-xs shadow-none",
          compact ? "w-[8.5rem]" : "w-[10.5rem]",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <SelectValue>
          <span
            className={cn(
              "flex items-center gap-2 font-medium",
              inboxPriorityTextClass(value),
            )}
          >
            <InboxPriorityIcon priority={value} />
            {INBOX_PRIORITY_LABELS[value]}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent onClick={(event) => event.stopPropagation()}>
        {INBOX_PRIORITIES.map((priority) => (
          <SelectItem key={priority} value={priority} className="text-xs">
            <span
              className={cn(
                "flex items-center gap-2 font-medium",
                inboxPriorityTextClass(priority),
              )}
            >
              <InboxPriorityIcon priority={priority} />
              {INBOX_PRIORITY_LABELS[priority]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
