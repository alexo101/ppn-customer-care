import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCreateRule,
  useSendRuleAuthoringMessage,
  useUpdateRule,
  type IntentCategory,
  type KnowledgeSource,
  type OrchestratorRule,
  type RuleAuthoringDraft,
  type RuleAuthoringResponseStatus,
  type Target,
} from "@workspace/api-client-react";
import { Bot, Check, Loader2, Send, Sparkles, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatStatus = RuleAuthoringResponseStatus | "idle";

type RuleAuthoringChatProps = {
  agentId: string;
  rule: OrchestratorRule | null;
  categories: IntentCategory[];
  sources: KnowledgeSource[];
  audienceTargets: Target[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function RuleAuthoringChat({
  agentId,
  rule,
  categories,
  sources,
  audienceTargets,
  open,
  onOpenChange,
  onSaved,
}: RuleAuthoringChatProps) {
  const { toast } = useToast();
  const authorRule = useSendRuleAuthoringMessage();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<RuleAuthoringDraft | undefined>();
  const [status, setStatus] = useState<ChatStatus>("idle");

  const categoryNames = useMemo(
    () =>
      Object.fromEntries(
        categories.map((category) => [category.id, category.name]),
      ),
    [categories],
  );
  const sourceNames = useMemo(
    () => Object.fromEntries(sources.map((source) => [source.id, source.name])),
    [sources],
  );

  useEffect(() => {
    if (!open) return;
    setInput("");
    setStatus("idle");
    setMessages([
      {
        role: "assistant",
        content: rule
          ? "Tell me what you would like to change about this rule. I’ll update it and ask you to confirm before saving."
          : "Describe the rule you want in natural language. I’ll ask if anything is unclear and show you the finished rule before saving.",
      },
    ]);
    setDraft(rule ? draftFromRule(rule) : undefined);
  }, [open, rule?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  const busy =
    authorRule.isPending || createRule.isPending || updateRule.isPending;

  const saveApprovedDraft = (approvedDraft: RuleAuthoringDraft) => {
    const payload = normalizeDraft(approvedDraft);
    const onSuccess = () => {
      toast({ title: rule ? "Rule updated" : "Rule created" });
      onSaved();
      onOpenChange(false);
    };
    const onError = (error: unknown) => {
      setStatus("ready_for_confirmation");
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `I couldn’t save the approved rule. ${apiErrorMessage(error, "Please try again.")}`,
        },
      ]);
    };

    if (rule) {
      updateRule.mutate({ id: rule.id, data: payload }, { onSuccess, onError });
    } else {
      createRule.mutate(
        { data: { ...payload, agentId } },
        { onSuccess, onError },
      );
    }
  };

  const sendMessage = (content: string) => {
    const message = content.trim();
    if (!message || busy) return;

    const history = messages.slice(-30);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");

    authorRule.mutate(
      {
        agentId,
        data: {
          message,
          history,
          draft: draft ? normalizeDraft(draft) : undefined,
          awaitingConfirmation: status === "ready_for_confirmation",
        },
      },
      {
        onSuccess: (result) => {
          setMessages((current) => [
            ...current,
            { role: "assistant", content: result.assistantMessage },
          ]);
          if (result.draft) setDraft(normalizeDraft(result.draft));
          setStatus(result.status);
          if (result.status === "approved" && result.draft) {
            saveApprovedDraft(result.draft);
          }
        },
        onError: (error) => {
          setMessages((current) => [
            ...current,
            {
              role: "assistant",
              content: apiErrorMessage(
                error,
                "Rule authoring is temporarily unavailable. Please try again.",
              ),
            },
          ]);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="flex h-[min(760px,90vh)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {rule ? "Edit rule with AI" : "Create rule with AI"}
          </DialogTitle>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto bg-muted/20 px-5 py-5"
        >
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((message, index) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={`${message.role}-${index}`}
                  className={cn("flex gap-2", isUser && "justify-end")}
                >
                  {!isUser && (
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </span>
                  )}
                  <div
                    className={cn(
                      "max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                      isUser
                        ? "rounded-tr-sm bg-primary text-primary-foreground"
                        : "rounded-tl-sm border border-border bg-card text-card-foreground",
                    )}
                  >
                    {message.content}
                  </div>
                  {isUser && (
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <User className="h-4 w-4" />
                    </span>
                  )}
                </div>
              );
            })}

            {authorRule.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Building the rule…
              </div>
            )}

            {status === "ready_for_confirmation" && draft && (
              <RulePreview
                draft={normalizeDraft(draft)}
                categoryNames={categoryNames}
                sourceNames={sourceNames}
                audienceTargets={audienceTargets}
                onConfirm={() => saveApprovedDraft(draft)}
                disabled={busy}
              />
            )}
          </div>
        </div>

        <form
          className="border-t border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage(input);
          }}
        >
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder={
                status === "ready_for_confirmation"
                  ? "Reply OK, or describe what to change…"
                  : "Describe your rule or answer the question…"
              }
              disabled={busy || status === "approved"}
              className="min-h-[44px] max-h-32 resize-none text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || busy || status === "approved"}
              aria-label="Send message"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-[11px] text-muted-foreground">
            Nothing is saved until you explicitly approve the proposed rule.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RulePreview({
  draft,
  categoryNames,
  sourceNames,
  audienceTargets,
  onConfirm,
  disabled,
}: {
  draft: RuleAuthoringDraft;
  categoryNames: Record<string, string>;
  sourceNames: Record<string, string>;
  audienceTargets: Target[];
  onConfirm: () => void;
  disabled: boolean;
}) {
  const categoryIds = draft.categoryIds ?? [];
  const sourceIds = draft.sourceIds ?? [];
  const audienceTargetIds = draft.audienceTargetIds ?? [];

  return (
    <div className="ml-9 rounded-xl border border-primary/30 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-primary">
          Rule ready for confirmation
        </p>
        <div className="flex items-center gap-1.5">
          <Badge variant={draft.isEnabled ? "default" : "outline"}>
            {draft.isEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </div>
      <p className="text-sm font-medium leading-6">{draft.name}</p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <PreviewValue
          label="Categories"
          value={categoryIds.map((id) => categoryNames[id] ?? id).join(", ")}
        />
        <PreviewValue label="Action" value={draft.action} />
        {sourceIds.length > 0 && (
          <PreviewValue
            label="Sources"
            value={sourceIds.map((id) => sourceNames[id] ?? id).join(", ")}
          />
        )}
        <PreviewValue label="Operator" value={draft.conditionOperator} />
        {audienceTargetIds.length > 0 && (
          <PreviewValue
            label="Audience targets"
            value={audienceTargetIds
              .map(
                (id) =>
                  audienceTargets.find((target) => target.id === id)?.name ??
                  id,
              )
              .join(", ")}
          />
        )}
        {draft.promptTemplate && (
          <PreviewValue label="Prompt template" value={draft.promptTemplate} />
        )}
        {draft.requiresClarificationPrompt && (
          <PreviewValue
            label="Clarification prompt"
            value={draft.requiresClarificationPrompt}
          />
        )}
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Reply with changes to revise it.
        </p>
        <Button size="sm" onClick={onConfirm} disabled={disabled}>
          <Check className="h-3.5 w-3.5" />
          Confirm and save
        </Button>
      </div>
    </div>
  );
}

function PreviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

export function normalizeDraft(draft: RuleAuthoringDraft): RuleAuthoringDraft {
  return {
    ...draft,
    categoryIds: draft.categoryIds ?? [],
    sourceIds: draft.sourceIds ?? [],
    audienceTargetIds: draft.audienceTargetIds ?? [],
  };
}

function draftFromRule(rule: OrchestratorRule): RuleAuthoringDraft {
  return normalizeDraft({
    name: rule.name,
    description: rule.description,
    promptTemplate: rule.promptTemplate,
    priority: rule.priority,
    requiresClarificationPrompt: rule.requiresClarificationPrompt ?? "",
    escalationTrigger: rule.escalationTrigger,
    isEnabled: rule.isEnabled,
    conditionOperator: rule.conditionOperator,
    action: rule.action,
    categoryIds: rule.categoryIds,
    sourceIds: rule.sourceIds,
    audienceTargetIds: rule.audienceTargetIds,
  });
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return error.message.replace(/^HTTP \d+\s[^:]+:\s*/, "") || fallback;
}

export type RuleAuthoringPanelProps = {
  agentId: string;
  rule: OrchestratorRule | null;
  categories: IntentCategory[];
  sources: KnowledgeSource[];
  audienceTargets: Target[];
  draft: RuleAuthoringDraft | undefined;
  onDraftChange: (draft: RuleAuthoringDraft) => void;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  status: ChatStatus;
  onStatusChange: (status: ChatStatus) => void;
  input: string;
  onInputChange: (value: string) => void;
  busy: boolean;
  onApprovedSave: (draft: RuleAuthoringDraft) => void;
};

export function RuleAuthoringPanel({
  agentId,
  categories,
  sources,
  audienceTargets,
  draft,
  onDraftChange,
  messages,
  onMessagesChange,
  status,
  onStatusChange,
  input,
  onInputChange,
  busy,
  onApprovedSave,
}: RuleAuthoringPanelProps) {
  const authorRule = useSendRuleAuthoringMessage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const sourceNames = useMemo(
    () => Object.fromEntries(sources.map((source) => [source.id, source.name])),
    [sources],
  );
  const isBusy = busy || authorRule.isPending;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, status]);

  const sendMessage = (content: string) => {
    const message = content.trim();
    if (!message || isBusy) return;
    const history = messages.slice(-30);
    onMessagesChange([...messages, { role: "user", content: message }]);
    onInputChange("");

    authorRule.mutate(
      {
        agentId,
        data: {
          message,
          history,
          draft: draft ? normalizeDraft(draft) : undefined,
          awaitingConfirmation: status === "ready_for_confirmation",
        },
      },
      {
        onSuccess: (result) => {
          onMessagesChange([
            ...messages,
            { role: "user", content: message },
            { role: "assistant", content: result.assistantMessage },
          ]);
          if (result.draft) onDraftChange(normalizeDraft(result.draft));
          onStatusChange(result.status);
          if (result.status === "approved" && result.draft) {
            onApprovedSave(result.draft);
          }
        },
        onError: (error) => {
          onMessagesChange([
            ...messages,
            { role: "user", content: message },
            {
              role: "assistant",
              content: apiErrorMessage(
                error,
                "Rule authoring is temporarily unavailable. Please try again.",
              ),
            },
          ]);
        },
      },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-5 py-5">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div key={`${message.role}-${index}`} className={cn("flex gap-2", isUser && "justify-end")}>
                {!isUser && (
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                    isUser
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm border border-border bg-card text-card-foreground",
                  )}
                >
                  {message.content}
                </div>
                {isUser && (
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <User className="h-4 w-4" />
                  </span>
                )}
              </div>
            );
          })}

          {authorRule.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Building the rule…
            </div>
          )}

          {status === "ready_for_confirmation" && draft && (
            <RulePreview
              draft={normalizeDraft(draft)}
              categoryNames={categoryNames}
              sourceNames={sourceNames}
              audienceTargets={audienceTargets}
              onConfirm={() => onApprovedSave(draft)}
              disabled={isBusy}
            />
          )}
        </div>
      </div>

      <form
        className="border-t border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage(input);
        }}
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder={
              status === "ready_for_confirmation"
                ? "Reply OK, or describe what to change…"
                : "Describe your rule or answer the question…"
            }
            disabled={isBusy || status === "approved"}
            className="min-h-[44px] max-h-32 resize-none text-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isBusy || status === "approved"}
            aria-label="Send message"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-[11px] text-muted-foreground">
          Nothing is saved until you explicitly approve the proposed rule.
        </p>
      </form>
    </div>
  );
}
