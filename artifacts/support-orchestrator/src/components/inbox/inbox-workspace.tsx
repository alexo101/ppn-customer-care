import { useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PanelRight,
} from "lucide-react";
import type {
  InboxEscalation,
  InboxEscalationPriority,
  InboxEscalationStatus,
  Message,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  avatarToneClass,
  customerDisplayName,
  escalationCode,
  initialsFromName,
} from "@/lib/inbox-format";
import { InboxConversationPanel } from "@/components/inbox/inbox-conversation-panel";
import { InboxDetailsRail } from "@/components/inbox/inbox-details-rail";
import { InboxStatusSelect } from "@/components/inbox/inbox-status-select";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

export function InboxWorkspace({
  escalation,
  messages,
  resolutionStatus,
  isLoadingMessages,
  isSending,
  isClaiming,
  isUpdatingStatus,
  isGeneratingSummary,
  index,
  total,
  onBack,
  onPrevious,
  onNext,
  onClaim,
  onStatusChange,
  onPriorityChange,
  onResolve,
  onSend,
  onGenerateSummary,
}: {
  escalation: InboxEscalation;
  messages: Message[];
  resolutionStatus?: string;
  isLoadingMessages?: boolean;
  isSending?: boolean;
  isClaiming?: boolean;
  isUpdatingStatus?: boolean;
  isGeneratingSummary?: boolean;
  index: number;
  total: number;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onClaim: () => void;
  onStatusChange: (status: InboxEscalationStatus) => void;
  onPriorityChange: (priority: InboxEscalationPriority) => void;
  onResolve: () => void;
  onSend: (content: string) => void;
  onGenerateSummary: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const name = customerDisplayName(escalation);
  const details = (
    <InboxDetailsRail
      escalation={escalation}
      messageCount={messages.length}
      resolutionStatus={resolutionStatus}
      isGenerating={isGeneratingSummary}
      isUpdatingPriority={isUpdatingStatus}
      onGenerateSummary={onGenerateSummary}
      onPriorityChange={onPriorityChange}
    />
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 px-2 text-xs"
            onClick={onBack}
          >
            <ChevronLeft className="h-4 w-4" />
            All escalations
          </Button>
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              avatarToneClass(name),
            )}
          >
            {initialsFromName(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {escalationCode(escalation.conversationId)} · {escalation.teamName}{" "}
              · Conversation {escalation.conversationId.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1 sm:flex">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={onPrevious}
              disabled={index <= 0}
              aria-label="Previous escalation"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-12 text-center text-xs text-muted-foreground">
              {index + 1} of {total}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={onNext}
              disabled={index >= total - 1}
              aria-label="Next escalation"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {escalation.assigneeMemberId === null ? (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={onClaim}
              disabled={isClaiming}
            >
              {isClaiming ? "Assigning..." : "Assign to me"}
            </Button>
          ) : null}
          <InboxStatusSelect
            value={escalation.status}
            disabled={isUpdatingStatus}
            onValueChange={onStatusChange}
          />
          {escalation.status !== "resolved" ? (
            <Button
              size="sm"
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-600"
              onClick={onResolve}
              disabled={isUpdatingStatus}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark resolved
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 xl:hidden"
            onClick={() => setDetailsOpen(true)}
            aria-label="Open escalation details"
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <InboxConversationPanel
          escalation={escalation}
          messages={messages}
          isLoading={isLoadingMessages}
          isSending={isSending}
          onSend={onSend}
        />
        <div className="hidden h-full xl:flex">{details}</div>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-[320px] p-0">
          <SheetTitle className="sr-only">Escalation details</SheetTitle>
          {details}
        </SheetContent>
      </Sheet>
    </div>
  );
}
