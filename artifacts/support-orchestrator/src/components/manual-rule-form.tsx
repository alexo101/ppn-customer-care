import { useMemo, useState } from "react";
import {
  getListRuleVocabulariesQueryKey,
  useCreateRuleVocabulary,
  useListRuleVocabularies,
  type IntentCategory,
  type KnowledgeSource,
  type ApiConnector,
  type RuleAuthoringDraft,
  type Target,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderTree, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  actionIsEscalation,
  actionUsesSource,
  formatCategoryPath,
  formatRuleSentence,
  normalizeDraft,
} from "@/lib/rules";

type VocabularyKind = "operator" | "action";

type ManualRuleFormProps = {
  agentId: string;
  draft: RuleAuthoringDraft;
  onDraftChange: (draft: RuleAuthoringDraft) => void;
  categories: IntentCategory[];
  sources: KnowledgeSource[];
  connectors: ApiConnector[];
  audienceTargets: Target[];
  onSave: () => void;
  saving: boolean;
};

export function ManualRuleForm({
  agentId,
  draft,
  onDraftChange,
  categories,
  sources,
  connectors,
  audienceTargets,
  onSave,
  saving,
}: ManualRuleFormProps) {
  const normalized = normalizeDraft(draft);
  const update = (patch: Partial<RuleAuthoringDraft>) =>
    onDraftChange(normalizeDraft({ ...normalized, ...patch }));
  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, formatCategoryPath(category.id, categories)])),
    [categories],
  );
  const sourceNames = useMemo(
    () => Object.fromEntries(sources.map((source) => [source.id, source.name])),
    [sources],
  );
  const targetNames = useMemo(
    () => Object.fromEntries(audienceTargets.map((target) => [target.id, target.name])),
    [audienceTargets],
  );
  const needsSource = actionUsesSource(normalized.action);
  const needsConnector = normalized.action.trim().toLowerCase().includes("live data");
  const canSave = Boolean(normalized.name.trim() && normalized.categoryIds?.length);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSave();
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            Build the rule yourself by choosing every condition and response setting. You can switch to
            <span className="font-medium text-foreground"> Describe to AI </span>
            at any time.
          </div>

          <section className="space-y-3">
            <SectionHeading title="Rule details" description="Give this rule a name and explain what it should do." />
            <Field label="Name" required>
              <Input
                value={normalized.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="e.g. Shipping questions"
                required
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={normalized.description}
                onChange={(event) => update({ description: event.target.value })}
                placeholder="When should this rule apply?"
                className="min-h-20 resize-y"
              />
            </Field>
          </section>

          <section className="space-y-3">
            <SectionHeading
              title="When should it run?"
              description="Choose the operator and at least one category or subcategory."
            />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,220px)_1fr]">
              <VocabPicker
                agentId={agentId}
                kind="operator"
                label="Operator"
                value={normalized.conditionOperator}
                onChange={(value) => update({ conditionOperator: value })}
              />
              <CategoryHierarchyPicker
                categories={categories}
                values={normalized.categoryIds ?? []}
                onChange={(categoryIds) => update({ categoryIds })}
              />
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeading title="What should happen?" description="Choose the action and configure its response." />
            <VocabPicker
              agentId={agentId}
              kind="action"
              label="Action"
              value={normalized.action}
              onChange={(value) =>
                update({
                  action: value,
                  escalationTrigger: actionIsEscalation(value) ? true : normalized.escalationTrigger,
                })
              }
            />
            {needsSource && (
              <MultiCheckList
                label="Sources"
                hint="Select the knowledge sources used to produce the answer."
                options={sources.map((source) => ({ id: source.id, name: source.name }))}
                values={normalized.sourceIds ?? []}
                onChange={(sourceIds) => update({ sourceIds })}
                emptyMessage="No sources are available for this agent."
              />
            )}
            {needsConnector && (
              <MultiCheckList
                label="API connectors"
                hint="Select approved API connectors used to retrieve live data."
                options={connectors.map((connector) => ({ id: connector.id, name: connector.name }))}
                values={normalized.connectorIds ?? []}
                onChange={(connectorIds) => update({ connectorIds })}
                emptyMessage="No API connectors are available for this agent."
              />
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Response template" hint="Optional instructions or template for the response.">
                <Textarea
                  value={normalized.promptTemplate}
                  onChange={(event) => update({ promptTemplate: event.target.value })}
                  placeholder="Use the relevant source content to answer clearly..."
                  className="min-h-24 resize-y"
                />
              </Field>
              <Field label="Clarification question" hint="Optional question to ask when the request is ambiguous.">
                <Textarea
                  value={normalized.requiresClarificationPrompt}
                  onChange={(event) => update({ requiresClarificationPrompt: event.target.value })}
                  placeholder="Could you share your order number?"
                  className="min-h-24 resize-y"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeading title="Who does it apply to?" description="Leave this empty to apply the rule to everyone." />
            <MultiCheckList
              label="Audience targets"
              options={audienceTargets.map((target) => ({ id: target.id, name: target.name }))}
              values={normalized.audienceTargetIds ?? []}
              onChange={(audienceTargetIds) => update({ audienceTargetIds })}
              emptyMessage="No audience targets are configured."
            />
          </section>

          <section className="space-y-3">
            <SectionHeading title="Settings" description="Control whether the rule is active and how it handles escalation." />
            <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg border border-border p-4">
              <ToggleField
                id="manual-rule-enabled"
                label="Enabled"
                checked={normalized.isEnabled}
                onChange={(isEnabled) => update({ isEnabled })}
              />
              <ToggleField
                id="manual-rule-escalation"
                label="Escalate to a human"
                checked={normalized.escalationTrigger}
                onChange={(escalationTrigger) => update({ escalationTrigger })}
              />
            </div>
          </section>

          <div className="rounded-lg border border-primary/20 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-primary">Rule preview</p>
                <p className="mt-1 text-sm leading-6">
                  {formatRuleSentence({
                    operator: normalized.conditionOperator,
                    categoryNames: (normalized.categoryIds ?? []).map((id) => categoryNames[id] ?? id),
                    action: normalized.action,
                    sourceNames: (normalized.sourceIds ?? []).map((id) => sourceNames[id] ?? id),
                    requiresSource: needsSource,
                    audienceTargetNames: (normalized.audienceTargetIds ?? []).map((id) => targetNames[id] ?? id),
                  })}
                </p>
              </div>
              <Badge variant={normalized.isEnabled ? "default" : "outline"}>
                {normalized.isEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-6 py-4">
        <p className="text-xs text-muted-foreground">
          {canSave ? "Ready to save this rule." : "Add a name and at least one category or subcategory to save."}
        </p>
        <Button type="submit" disabled={saving || !canSave}>
          <Save className="h-4 w-4" />
          Save rule
        </Button>
      </div>
    </form>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ToggleField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-xs">{label}</Label>
    </div>
  );
}

function CategoryHierarchyPicker({
  categories,
  values,
  onChange,
}: {
  categories: IntentCategory[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const parents = useMemo(
    () => categories.filter((category) => !category.parentId),
    [categories],
  );
  const childrenByParent = useMemo(() => {
    const grouped = new Map<string, IntentCategory[]>();
    for (const category of categories) {
      if (!category.parentId) continue;
      const list = grouped.get(category.parentId) ?? [];
      list.push(category);
      grouped.set(category.parentId, list);
    }
    return grouped;
  }, [categories]);
  const parentIds = useMemo(() => new Set(parents.map((category) => category.id)), [parents]);
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const orphaned = useMemo(
    () => categories.filter((category) => category.parentId && !parentIds.has(category.parentId)),
    [categories, parentIds],
  );

  const toggle = (id: string, checked: boolean) => {
    if (!checked) {
      onChange(values.filter((value) => value !== id));
      return;
    }

    const category = categoryById.get(id);
    const nextValues = category?.parentId
      ? [...values, category.parentId, id]
      : [...values, id];
    onChange([...new Set(nextValues)]);
  };

  const selectedCount = values.length;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        Categories
        <span className="ml-1 text-destructive">*</span>
      </Label>
      <p className="text-[11px] text-muted-foreground">
        Subcategories are nested inside their parent category. Select a category, a subcategory, or both.
      </p>
      {parents.length === 0 && orphaned.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Create a category first to use it in a rule.
        </div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-border p-2">
          {parents.map((parent) => {
            const children = childrenByParent.get(parent.id) ?? [];
            return (
              <div key={parent.id} className="overflow-hidden rounded-md border border-border bg-card">
                <label className="flex cursor-pointer items-center gap-2 bg-muted/40 px-3 py-2">
                  <Checkbox
                    checked={values.includes(parent.id)}
                    onCheckedChange={(checked) => toggle(parent.id, checked === true)}
                  />
                  <FolderTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{parent.name}</span>
                  <Badge variant="outline" className="h-5 shrink-0 text-[10px] font-medium">
                    Category
                  </Badge>
                </label>
                {children.length > 0 ? (
                  <div className="border-t border-border bg-background px-3 py-2">
                    <p className="mb-2 pl-6 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Subcategories
                    </p>
                    <div className="space-y-1.5 border-l-2 border-border ml-2 pl-4">
                      {children.map((child) => (
                        <label key={child.id} className="flex min-w-0 cursor-pointer items-center gap-2 py-0.5">
                          <Checkbox
                            checked={values.includes(child.id)}
                            onCheckedChange={(checked) => toggle(child.id, checked === true)}
                          />
                          <span className="min-w-0 flex-1 truncate text-xs">{child.name}</span>
                          <Badge variant="secondary" className="h-5 shrink-0 text-[10px] font-normal">
                            Subcategory
                          </Badge>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="border-t border-border px-3 py-2 pl-9 text-[11px] text-muted-foreground">
                    No subcategories in this category.
                  </p>
                )}
              </div>
            );
          })}
          {orphaned.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <div className="bg-muted/40 px-3 py-2">
                <p className="text-xs font-medium">Subcategories without a parent</p>
              </div>
              <div className="space-y-1.5 px-3 py-2">
                {orphaned.map((child) => (
                  <label key={child.id} className="flex min-w-0 cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={values.includes(child.id)}
                      onCheckedChange={(checked) => toggle(child.id, checked === true)}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">{child.name}</span>
                    <Badge variant="secondary" className="h-5 shrink-0 text-[10px] font-normal">
                      Subcategory
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
      {selectedCount > 0 ? (
        <p className="text-[11px] text-muted-foreground">{selectedCount} selected</p>
      ) : null}
    </div>
  );
}

function MultiCheckList({
  label,
  hint,
  options,
  values,
  onChange,
  emptyMessage,
  required,
}: {
  label: string;
  hint?: string;
  options: { id: string; name: string }[];
  values: string[];
  onChange: (values: string[]) => void;
  emptyMessage: string;
  required?: boolean;
}) {
  const toggle = (id: string, checked: boolean) => {
    const next = checked ? [...new Set([...values, id])] : values.filter((value) => value !== id);
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {options.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid max-h-36 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
          {options.map((option) => (
            <label key={option.id} className="flex min-w-0 items-center gap-2 text-xs">
              <Checkbox
                checked={values.includes(option.id)}
                onCheckedChange={(checked) => toggle(option.id, checked === true)}
              />
              <span className="truncate">{option.name}</span>
            </label>
          ))}
        </div>
      )}
      {values.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">{values.length} selected</p>
      ) : null}
    </div>
  );
}

function VocabPicker({
  agentId,
  kind,
  label,
  value,
  onChange,
}: {
  agentId: string;
  kind: VocabularyKind;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const vocabularies = useListRuleVocabularies({ agentId, kind });
  const createVocabulary = useCreateRuleVocabulary();
  const entries = useMemo(() => {
    const current = value.trim();
    if (current && !vocabularies.data?.some((item) => item.label === current)) {
      return [{ id: `current-${current}`, label: current }, ...(vocabularies.data ?? [])];
    }
    return vocabularies.data ?? [];
  }, [value, vocabularies.data]);

  const addCustom = () => {
    const trimmed = customLabel.trim();
    if (!trimmed || createVocabulary.isPending) return;
    createVocabulary.mutate(
      { data: { agentId, kind, label: trimmed } },
      {
        onSuccess: (created) => {
          onChange(created.label);
          setCustomLabel("");
          setAdding(false);
          queryClient.invalidateQueries({ queryKey: getListRuleVocabulariesQueryKey({ agentId, kind }) });
          toast({ title: `${label} added` });
        },
        onError: (error) => {
          toast({
            title: `Could not add ${label.toLowerCase()}`,
            description: error instanceof Error ? error.message : "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {entries.map((entry) => (
            <SelectItem key={entry.id} value={entry.label}>{entry.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!adding ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-[11px] text-muted-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add custom {label.toLowerCase()}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            placeholder={`New ${label.toLowerCase()}`}
            className="h-8 text-xs"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustom();
              }
              if (event.key === "Escape") setAdding(false);
            }}
          />
          <Button type="button" size="sm" className="h-8 text-xs" onClick={addCustom} disabled={!customLabel.trim()}>
            Add
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAdding(false)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
