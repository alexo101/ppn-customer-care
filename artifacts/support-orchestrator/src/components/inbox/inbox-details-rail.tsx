import type { ReactNode } from "react";
import { ChevronDown, Clock, Loader2, Sparkles } from "lucide-react";
import type {
  InboxEscalation,
  InboxEscalationPriority,
} from "@workspace/api-client-react";
import { customerContextFields, humanizeKey, stringValue } from "@/lib/inbox-context";
import { customerDisplayName, formatWaitingDuration } from "@/lib/inbox-format";
import { InboxPrioritySelect } from "@/components/inbox/inbox-priority-select";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

export function InboxDetailsRail({
  escalation,
  messageCount,
  resolutionStatus,
  isGenerating,
  isUpdatingPriority,
  onGenerateSummary,
  onPriorityChange,
}: {
  escalation: InboxEscalation;
  messageCount?: number;
  resolutionStatus?: string;
  isGenerating?: boolean;
  isUpdatingPriority?: boolean;
  onGenerateSummary: () => void;
  onPriorityChange: (priority: InboxEscalationPriority) => void;
}) {
  const extraFields = customerContextFields(escalation.context);
  const customer = customerDisplayName(escalation);

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto border-l border-border bg-background">
      <CollapsibleSection
        icon={<Sparkles className="h-4 w-4 text-primary" />}
        title="AI summary"
      >
        {escalation.aiSummary ? (
          <p className="whitespace-pre-wrap text-sm leading-6">
            {escalation.aiSummary}
          </p>
        ) : (
          <Button
            className="gap-2"
            size="sm"
            onClick={onGenerateSummary}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Generate summary
          </Button>
        )}
      </CollapsibleSection>

      <Separator />

      <CollapsibleSection title="Escalation context">
        <div className="space-y-4">
          <ContextRow
            label="Why the agent escalated"
            value={escalation.reason || "—"}
          />
          <ContextRow
            label="Rule used"
            value={
              [escalation.category, escalation.subcategory]
                .filter(Boolean)
                .join(" / ") || "—"
            }
          />
          <ContextRow
            label="User question"
            value={stringValue(escalation.context.userQuestion) || "—"}
          />
          {resolutionStatus ? (
            <ContextRow
              label="Resolution status"
              value={humanizeKey(resolutionStatus.replace(/_/g, " "))}
            />
          ) : null}
          {escalation.previousAnswer ? (
            <ContextRow label="AI response" value={escalation.previousAnswer} />
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <ContextRow label="Category" value={escalation.category || "—"} />
            <ContextRow
              label="Subcategory"
              value={escalation.subcategory || "—"}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ContextRow
              label="Priority"
              value={
                <InboxPrioritySelect
                  compact
                  value={escalation.priority}
                  disabled={isUpdatingPriority}
                  onValueChange={onPriorityChange}
                  className="mt-0.5 h-8 w-full"
                />
              }
            />
            <ContextRow
              label="Waiting"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatWaitingDuration(escalation.lastActivityAt)}
                </span>
              }
            />
          </div>
          {escalation.retrievedInformation.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Information already retrieved
              </p>
              <div className="mt-2 space-y-2">
                {escalation.retrievedInformation.map((item, index) => (
                  <div
                    key={`${stringValue(item.sourceId) || index}`}
                    className="rounded-md bg-muted/50 p-2 text-xs"
                  >
                    <p className="font-medium">
                      {stringValue(item.sourceName) || "Source"}
                    </p>
                    <p className="mt-1 line-clamp-4 text-muted-foreground">
                      {stringValue(item.excerpt) || "Retrieved data available."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </CollapsibleSection>

      <Separator />

      <CollapsibleSection title="Customer">
        <div className="space-y-4">
          <ContextRow label="Name" value={customer} />
          <ContextRow label="Email" value={escalation.customerEmail || "—"} />
          {extraFields.map((field) => (
            <ContextRow key={field.key} label={field.label} value={field.value} />
          ))}
        </div>
      </CollapsibleSection>
    </aside>
  );
}

function CollapsibleSection({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen>
      <section className="p-4">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              {icon}
              {title}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          {children}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function ContextRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 whitespace-pre-wrap text-sm">{value}</div>
    </div>
  );
}
