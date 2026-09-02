import { useEffect, useState } from "react";
import {
  useCreateRule,
  useUpdateRule,
  type IntentCategory,
  type KnowledgeSource,
  type OrchestratorRule,
  type RuleAuthoringDraft,
  type Target,
} from "@workspace/api-client-react";
import { Loader2, PenLine, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  apiErrorMessage,
  draftFromRule,
  emptyRuleDraft,
  normalizeDraft,
} from "@/lib/rules";
import {
  ChatMessage,
  ChatStatus,
  RuleAuthoringPanel,
} from "@/components/rule-authoring-chat";
import { ManualRuleForm } from "@/components/manual-rule-form";
import { useWorkspaceAccess } from "@/components/workspace-access";

type RuleEditorDialogProps = {
  agentId: string;
  rule: OrchestratorRule | null;
  categories: IntentCategory[];
  sources: KnowledgeSource[];
  audienceTargets: Target[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  initialMode: "manual" | "ai";
  suggestedPriority: number;
};

export function RuleEditorDialog({
  agentId,
  rule,
  categories,
  sources,
  audienceTargets,
  open,
  onOpenChange,
  onSaved,
  initialMode,
  suggestedPriority,
}: RuleEditorDialogProps) {
  const { canEdit } = useWorkspaceAccess();
  const { toast } = useToast();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const [mode, setMode] = useState<"manual" | "ai">(initialMode);
  const [draft, setDraft] = useState<RuleAuthoringDraft>(emptyRuleDraft(suggestedPriority));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setDraft(rule ? draftFromRule(rule) : emptyRuleDraft(suggestedPriority));
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
  }, [open, initialMode, rule?.id, suggestedPriority]);

  const saving = createRule.isPending || updateRule.isPending;
  const title = rule ? "Edit rule" : "Create rule";

  if (!canEdit) return null;

  const handleSave = (nextDraft: RuleAuthoringDraft) => {
    const payload = normalizeDraft(nextDraft);
    if (!payload.name.trim()) {
      toast({ title: "Name your rule", variant: "destructive" });
      setMode("manual");
      return;
    }
    if (!payload.categoryIds?.length) {
      toast({ title: "Choose at least one category", variant: "destructive" });
      setMode("manual");
      return;
    }

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
          content: `I couldn’t save the rule. ${apiErrorMessage(error, "Please try again.")}`,
        },
      ]);
      toast({
        title: rule ? "Could not update rule" : "Could not create rule",
        description: apiErrorMessage(error, "Please try again."),
        variant: "destructive",
      });
    };

    if (rule) {
      const { priority: _priority, ...updatePayload } = payload;
      updateRule.mutate({ id: rule.id, data: updatePayload }, { onSuccess, onError });
    } else {
      createRule.mutate(
        { data: { ...payload, agentId, priority: suggestedPriority } },
        { onSuccess, onError },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex h-[min(860px,94vh)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            {mode === "ai" ? (
              <Sparkles className="h-4 w-4 text-primary" />
            ) : (
              <PenLine className="h-4 w-4 text-primary" />
            )}
            {title}
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as "manual" | "ai")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 border-b border-border bg-muted/20 px-6 py-3">
            <TabsList className="grid h-10 w-full max-w-md grid-cols-2">
              <TabsTrigger value="manual" className="gap-1.5 text-xs sm:text-sm">
                <PenLine className="h-3.5 w-3.5" />
                Write manually
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1.5 text-xs sm:text-sm">
                <Sparkles className="h-3.5 w-3.5" />
                Describe to AI
              </TabsTrigger>
            </TabsList>
            <p className="mt-2 text-xs text-muted-foreground">
              Choose either method. You can switch between them before saving.
            </p>
          </div>

          <TabsContent value="manual" className="mt-0 flex min-h-0 flex-1 flex-col">
            <ManualRuleForm
              agentId={agentId}
              draft={draft}
              onDraftChange={setDraft}
              categories={categories}
              sources={sources}
              audienceTargets={audienceTargets}
              onSave={() => handleSave(draft)}
              saving={saving}
            />
          </TabsContent>

          <TabsContent value="ai" className="mt-0 flex min-h-0 flex-1 flex-col">
            <RuleAuthoringPanel
              agentId={agentId}
              rule={rule}
              categories={categories}
              sources={sources}
              audienceTargets={audienceTargets}
              draft={draft}
              onDraftChange={setDraft}
              messages={messages}
              onMessagesChange={setMessages}
              status={status}
              onStatusChange={setStatus}
              input={input}
              onInputChange={setInput}
              busy={saving}
              onApprovedSave={handleSave}
            />
          </TabsContent>
        </Tabs>

        {saving ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 border-t border-border bg-card/95 px-4 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving rule…
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
