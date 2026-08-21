import { useMemo, useState } from "react";
import {
  getListRulesQueryKey,
  useDeleteRule,
  useListCategories,
  useListRules,
  useListSources,
  useListTargets,
  type OrchestratorRule,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Sparkles, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RuleAuthoringChat } from "@/components/rule-authoring-chat";
import { useToast } from "@/hooks/use-toast";
import { formatRuleSentence } from "@/lib/rules";
import { cn } from "@/lib/utils";

export function RulesTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: rules = [] } = useListRules({ agentId });
  const { data: categories = [] } = useListCategories({ agentId });
  const { data: sources = [] } = useListSources({ agentId });
  const { data: audienceTargets = [] } = useListTargets({ agentId });
  const deleteRule = useDeleteRule();
  const [search, setSearch] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<OrchestratorRule | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<OrchestratorRule | null>(
    null,
  );

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
  const audienceTargetNames = useMemo(
    () => Object.fromEntries(audienceTargets.map((target) => [target.id, target.name])),
    [audienceTargets],
  );

  const filteredRules = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rules;
    return rules.filter((rule) =>
      [
        rule.name,
        rule.conditionOperator,
        rule.action,
        ...rule.categoryIds.map((id) => categoryNames[id] ?? ""),
        ...rule.sourceIds.map((id) => sourceNames[id] ?? ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [rules, search, categoryNames, sourceNames]);

  const invalidateRules = () =>
    queryClient.invalidateQueries({
      queryKey: getListRulesQueryKey({ agentId }),
    });

  const openAuthoring = (rule: OrchestratorRule | null) => {
    setEditingRule(rule);
    setChatOpen(true);
  };

  const handleDelete = () => {
    if (!ruleToDelete) return;
    deleteRule.mutate(
      { id: ruleToDelete.id },
      {
        onSuccess: () => {
          setRuleToDelete(null);
          invalidateRules();
          toast({ title: "Rule deleted" });
        },
        onError: (error) => {
          toast({
            title: "Could not delete rule",
            description: apiErrorMessage(error, "Please try again."),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Rules
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {rules.length}
            </span>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => openAuthoring(null)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Rule
          </Button>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs leading-5 text-muted-foreground">
            Describe a rule in your own words. The assistant will clarify
            anything ambiguous, create the rule, and ask for approval before it
            is saved.
          </p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search rules..."
            className="h-9 bg-background/50 pl-9 text-xs"
          />
        </div>

        <div className="space-y-2.5">
          {filteredRules.map((rule) => {
            const sentence = formatRuleSentence({
              operator: rule.conditionOperator,
              categoryNames: rule.categoryIds
                .map((id) => categoryNames[id])
                .filter((name): name is string => Boolean(name)),
              action: rule.action,
              sourceNames: rule.sourceIds
                .map((id) => sourceNames[id])
                .filter((name): name is string => Boolean(name)),
              requiresSource: rule.sourceIds.length > 0,
              audienceTargetNames: (rule.audienceTargetIds ?? [])
                .map((id) => audienceTargetNames[id])
                .filter((name): name is string => Boolean(name)),
            });

            return (
              <div
                key={rule.id}
                className="group flex items-start rounded-lg border border-border/80 bg-card shadow-sm transition-all hover:border-blue-200 hover:bg-accent/20 dark:hover:border-blue-900/50"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 p-3 text-left"
                  onClick={() => openAuthoring(rule)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium leading-6 text-foreground">
                      {sentence}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="h-5 text-[10px] font-mono"
                      >
                        P{rule.priority}
                      </Badge>
                      <span
                        className={cn(
                          "text-[11px] font-semibold uppercase tracking-wider",
                          rule.isEnabled
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground/60",
                        )}
                      >
                        {rule.isEnabled ? "ON" : "OFF"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Select to edit conversationally
                  </p>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mr-2 mt-2 h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                  onClick={() => setRuleToDelete(rule)}
                  aria-label={`Delete ${rule.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}

          {filteredRules.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              {search
                ? "No rules match your search."
                : "No rules yet. Describe your first rule to the assistant."}
            </div>
          )}
        </div>
      </div>

      <RuleAuthoringChat
        agentId={agentId}
        rule={editingRule}
        categories={categories}
        sources={sources}
        audienceTargets={audienceTargets}
        open={chatOpen}
        onOpenChange={(next) => {
          setChatOpen(next);
          if (!next) setEditingRule(null);
        }}
        onSaved={invalidateRules}
      />

      <AlertDialog
        open={Boolean(ruleToDelete)}
        onOpenChange={(next) => !next && setRuleToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {ruleToDelete?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteRule.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return error.message.replace(/^HTTP \d+\s[^:]+:\s*/, "") || fallback;
}
