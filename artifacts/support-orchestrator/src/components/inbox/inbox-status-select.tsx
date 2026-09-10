import type { InboxEscalationStatus } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  INBOX_STATUS_LABELS,
  inboxStatusDotClass,
} from "@/lib/inbox-status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function InboxStatusSelect({
  value,
  disabled,
  onValueChange,
  className,
}: {
  value: InboxEscalationStatus;
  disabled?: boolean;
  onValueChange: (status: InboxEscalationStatus) => void;
  className?: string;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next as InboxEscalationStatus)}
    >
      <SelectTrigger
        aria-label="Escalation status"
        className={cn(
          "h-8 w-[11.5rem] gap-2 border-border bg-background px-2 text-xs shadow-none",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <SelectValue>
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                inboxStatusDotClass(value),
              )}
            />
            {INBOX_STATUS_LABELS[value]}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent onClick={(event) => event.stopPropagation()}>
        {(Object.keys(INBOX_STATUS_LABELS) as InboxEscalationStatus[]).map(
          (status) => (
            <SelectItem key={status} value={status} className="text-xs">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    inboxStatusDotClass(status),
                  )}
                />
                {INBOX_STATUS_LABELS[status]}
              </span>
            </SelectItem>
          ),
        )}
      </SelectContent>
    </Select>
  );
}
