import type { ReactNode } from "react";
import { Clock, Loader2, Sparkles } from "lucide-react";
import type { InboxEscalation } from "@workspace/api-client-react";
import { customerContextFields, humanizeKey, stringValue } from "@/lib/inbox-context";
import { customerDisplayName, formatWaitingDuration } from "@/lib/inbox-format";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function InboxDetailsRail({
  escalation,
  messageCount,
  resolutionStatus,
  isGenerating,
  onGenerateSummary,
}: {
  escalation: InboxEscalation;
  messageCount?: number;
  resolutionStatus?: string;
  isGenerating?: boolean;
  onGenerateSummary: () => void;
}) {
  const extraFields = customerContextFields(escalation.context);
  const customer = customerDisplayName(escalation);

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto border-l border-border bg-background">
      <section className="p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide">
              AI summary
            </h3>
            {escalation.aiSummary ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {escalation.aiSummary}
              </p>
            ) : (
              <>
                <Button
                  className="mt-3 gap-2"
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
              </>
            )}
          </div>
        </div>
      </section>

      <Separator />

      <section className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Escalation context
        </h3>
        <div className="mt-4 space-y-4">
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
          <ContextRow
            label="Waiting"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {formatWaitingDuration(escalation.lastActivityAt)}
              </span>
            }
          />
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
      </section>

      <Separator />

      <section className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Customer
        </h3>
        <div className="mt-4 space-y-4">
          <ContextRow label="Name" value={customer} />
          <ContextRow label="Email" value={escalation.customerEmail || "—"} />
          {extraFields.map((field) => (
            <ContextRow key={field.key} label={field.label} value={field.value} />
          ))}
        </div>
      </section>
    </aside>
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
