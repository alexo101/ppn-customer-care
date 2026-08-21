import { useMemo, useState } from "react";
import {
  getListRulesQueryKey,
  useDeleteRule,
  useListCategories,
  useListConnectors,
  useListRules,
  useListSources,
  useListTargets,
  useUpdateRule,
  type OrchestratorRule,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, PenLine, Plus, Search, Sparkles, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RuleEditorDialog } from "@/components/rule-editor-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatRuleSentence } from "@/lib/rules";
import { cn } from "@/lib/utils";

export function RulesTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: rules = [] } = useListRules({ agentId });
  const { data: categories = [] } = useListCategories({ agentId });
  const { data: sources = [] } = useListSources({ agentId });
  const { data: connectors = [] } = useListConnectors({ agentId });
  const { data: audienceTargets = [] } = useListTargets({ agentId });
  const deleteRule = useDeleteRule();
  const updateRule = useUpdateRule();
  const [search, setSearch] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<OrchestratorRule | null>(null);
  const [editorMode, setEditorMode] = useState<"manual" | "ai">("manual");
  const [ruleToDelete, setRuleToDelete] = useState<OrchestratorRule | null>(
    null,
  );
  // Local ordered copy for drag-and-drop (mirrors server list when not dragging)
  const [localRules, setLocalRules] = useState<OrchestratorRule[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Keep localRules in sync with server data when not actively dragging
  const orderedRules = isDragging ? localRules : rules;

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

  const isSearching = search.trim().length > 0;

  const filteredRules = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orderedRules;
    return orderedRules.filter((rule) =>
      [
        rule.name,
        rule.conditionOperator,
        rule.action,
        ...rule.categoryIds.map((id) => categoryNames[id] ?? ""),
        ...rule.sourceIds.map((id) => sourceNames[id] ?? ""),
        ...(rule.connectorIds ?? []).map((id) => connectors.find((connector) => connector.id === id)?.name ?? ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [orderedRules, search, categoryNames, sourceNames, connectors]);

  const invalidateRules = () =>
    queryClient.invalidateQueries({
      queryKey: getListRulesQueryKey({ agentId }),
    });

  const openAuthoring = (
    rule: OrchestratorRule | null,
    mode: "manual" | "ai" = "manual",
  ) => {
    setEditingRule(rule);
    setEditorMode(mode);
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

  const handleToggle = (rule: OrchestratorRule, isEnabled: boolean) => {
    // Optimistic update
    queryClient.setQueryData(
      getListRulesQueryKey({ agentId }),
      (prev: OrchestratorRule[] | undefined) =>
        prev?.map((r) => (r.id === rule.id ? { ...r, isEnabled } : r)),
    );
    updateRule.mutate(
      { id: rule.id, data: { isEnabled } },
      {
        onError: (error) => {
          invalidateRules();
          toast({
            title: "Could not update rule",
            description: apiErrorMessage(error, "Please try again."),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleReorderEnd = (reordered: OrchestratorRule[]) => {
    setIsDragging(false);
    const n = reordered.length;
    // Top of list = highest priority (n-1 down to 0)
    const withNewPriorities = reordered.map((rule, index) => ({
      rule,
      newPriority: n - 1 - index,
    }));

    const changed = withNewPriorities.filter(
      ({ rule, newPriority }) => rule.priority !== newPriority,
    );
    if (changed.length === 0) return;

    // Optimistic update to cache
    const nextRules = reordered.map(({ id }, index) => ({
      ...rules.find((r) => r.id === id)!,
      priority: n - 1 - index,
    }));
    queryClient.setQueryData(getListRulesQueryKey({ agentId }), nextRules);

    Promise.all(
      changed.map(({ rule, newPriority }) =>
        updateRule.mutateAsync({ id: rule.id, data: { priority: newPriority } }),
      ),
    ).catch((error) => {
      invalidateRules();
      toast({
        title: "Could not save order",
        description: apiErrorMessage(error, "Please try again."),
        variant: "destructive",
      });
    });
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => openAuthoring(null, "manual")}
            >
              <PenLine className="h-3.5 w-3.5" />
              Write manually
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => openAuthoring(null, "ai")}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Describe to AI
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3">
          <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs leading-5 text-muted-foreground">
            Create rules by filling in the fields yourself, or describe them in
            plain language and let the assistant draft them. You can switch
            methods and review the rule before saving.
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
          {isSearching ? (
            // Filtered list – no drag while searching
            <div className="space-y-2.5">
              {filteredRules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  categoryNames={categoryNames}
                  sourceNames={sourceNames}
                  audienceTargetNames={audienceTargetNames}
                  draggable={false}
                  onEdit={() => openAuthoring(rule)}
                  onDelete={() => setRuleToDelete(rule)}
                  onToggle={(enabled) => handleToggle(rule, enabled)}
                />
              ))}
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={orderedRules}
              onReorder={(reordered) => {
                setIsDragging(true);
                setLocalRules(reordered);
              }}
              className="space-y-2.5"
              layoutScroll
              as="div"
              onMouseUp={() => {
                if (isDragging) handleReorderEnd(localRules);
              }}
            >
              {orderedRules.map((rule) => (
                <ReorderRuleRow
                  key={rule.id}
                  rule={rule}
                  categoryNames={categoryNames}
                  sourceNames={sourceNames}
                  audienceTargetNames={audienceTargetNames}
                  onEdit={() => openAuthoring(rule)}
                  onDelete={() => setRuleToDelete(rule)}
                  onToggle={(enabled) => handleToggle(rule, enabled)}
                />
              ))}
            </Reorder.Group>
          )}

          {filteredRules.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              {search
                ? "No rules match your search."
                : "No rules yet. Write your first rule manually or describe it to the assistant."}
            </div>
          )}
        </div>
      </div>

      <RuleEditorDialog
        agentId={agentId}
        rule={editingRule}
        categories={categories}
        sources={sources}
        connectors={connectors}
        audienceTargets={audienceTargets}
        open={chatOpen}
        initialMode={editorMode}
        suggestedPriority={
          rules.length > 0 ? Math.max(...rules.map((rule) => rule.priority)) + 1 : 0
        }
        onOpenChange={(next) => {
          setChatOpen(next);
          if (!next) {
            setEditingRule(null);
            setEditorMode("manual");
          }
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

// ─── Row shared between draggable and static lists ───────────────────────────

type RowProps = {
  rule: OrchestratorRule;
  categoryNames: Record<string, string>;
  sourceNames: Record<string, string>;
  audienceTargetNames: Record<string, string>;
  draggable: boolean;
  dragControls?: ReturnType<typeof useDragControls>;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
};

function RuleRow({
  rule,
  categoryNames,
  sourceNames,
  audienceTargetNames,
  draggable,
  dragControls,
  onEdit,
  onDelete,
  onToggle,
}: RowProps) {
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
      className={cn(
        "group flex items-center rounded-lg border border-border/80 bg-card shadow-sm transition-all hover:border-blue-200 hover:bg-accent/20 dark:hover:border-blue-900/50",
        !rule.isEnabled && "opacity-60",
      )}
    >
      {/* Drag handle */}
      <div
        className={cn(
          "flex h-full cursor-grab items-center px-2 py-3 text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing",
          !draggable && "pointer-events-none invisible",
        )}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragControls?.start(e);
        }}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Rule sentence / click to edit */}
      <button
        type="button"
        className="min-w-0 flex-1 py-3 pr-2 text-left"
        onClick={onEdit}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-6 text-foreground">
            {sentence}
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Select to edit conversationally
        </p>
      </button>

      {/* Enable / disable toggle */}
      <div
        className="flex shrink-0 items-center gap-2 px-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Switch
          checked={rule.isEnabled}
          onCheckedChange={onToggle}
          aria-label={rule.isEnabled ? "Disable rule" : "Enable rule"}
        />
      </div>

      {/* Delete */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mr-2 h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${rule.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Framer-motion Reorder item wrapper ──────────────────────────────────────

type ReorderRowProps = Omit<RowProps, "draggable" | "dragControls">;

function ReorderRuleRow(props: ReorderRowProps) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={props.rule}
      dragListener={false}
      dragControls={dragControls}
      className="list-none"
    >
      <RuleRow {...props} draggable dragControls={dragControls} />
    </Reorder.Item>
  );
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return error.message.replace(/^HTTP \d+\s[^:]+:\s*/, "") || fallback;
}
