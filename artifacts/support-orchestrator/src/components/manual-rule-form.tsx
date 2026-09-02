import { useMemo, useState } from "react";
import {
  useListRuleVocabularies,
  type IntentCategory,
  type KnowledgeSource,
  type RuleAuthoringDraft,
  type Target,
} from "@workspace/api-client-react";
import { FolderTree, Info, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MutatingControls } from "@/components/workspace-access";
import {
  actionIsEscalation,
  formatCategoryPath,
  formatRuleSentence,
  HTTP_METHODS,
  isLiveDataAction,
  normalizeDraft,
  normalizeHttpMethod,
  RULE_COUNTRIES,
} from "@/lib/rules";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ManualRuleFormProps = {
  agentId: string;
  draft: RuleAuthoringDraft;
  onDraftChange: (draft: RuleAuthoringDraft) => void;
  categories: IntentCategory[];
  sources: KnowledgeSource[];
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
  audienceTargets,
  onSave,
  saving,
}: ManualRuleFormProps) {
  const normalized = normalizeDraft(draft);
  const update = (patch: Partial<RuleAuthoringDraft>) =>
    onDraftChange(normalizeDraft({ ...normalized, ...patch }));
  const categoryNames = useMemo(
    () =>
      Object.fromEntries(
        categories.map((category) => [
          category.id,
          formatCategoryPath(category.id, categories),
        ]),
      ),
    [categories],
  );
  const sourceNames = useMemo(
    () => Object.fromEntries(sources.map((source) => [source.id, source.name])),
    [sources],
  );
  const targetNames = useMemo(
    () =>
      Object.fromEntries(
        audienceTargets.map((target) => [target.id, target.name]),
      ),
    [audienceTargets],
  );
  const actionKind = normalized.action.trim().toLowerCase();
  const needsSource = actionKind.includes("search");
  const needsEndpoint = isLiveDataAction(normalized.action);
  const topLevelCategories = useMemo(
    () => categories.filter((category) => !category.parentId),
    [categories],
  );
  const selectedCategoryId = useMemo(() => {
    const selected = normalized.categoryIds ?? [];
    return (
      selected.find((id) =>
        topLevelCategories.some((category) => category.id === id),
      ) ?? ""
    );
  }, [normalized.categoryIds, topLevelCategories]);
  const subcategories = useMemo(
    () =>
      categories.filter((category) => category.parentId === selectedCategoryId),
    [categories, selectedCategoryId],
  );
  const selectedSubcategoryId =
    (normalized.categoryIds ?? []).find((id) =>
      subcategories.some((category) => category.id === id),
    ) ?? "";
  const selectedCountry = RULE_COUNTRIES.find(
    (country) => country.code === normalized.conditionCountry,
  );
  const previewCategoryNames = useMemo(
    () =>
      [selectedCategoryId, selectedSubcategoryId]
        .map((id) => categories.find((category) => category.id === id)?.name)
        .filter((name): name is string => Boolean(name)),
    [categories, selectedCategoryId, selectedSubcategoryId],
  );
  const canSave = Boolean(
    normalized.name.trim() && normalized.categoryIds?.length,
  );

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
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Name this rule so you can find it later. The guided sentence below
              shows exactly when it runs.
            </p>
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
                onChange={(event) =>
                  update({ description: event.target.value })
                }
                placeholder="When should this rule apply?"
                className="min-h-20 resize-y"
              />
            </Field>
          </div>

          <div className="rounded-xl bg-muted/20 px-4 py-5 text-sm leading-9">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="font-semibold text-primary">When</span>
              <span>Country is</span>
              <InlineSelect
                value={normalized.conditionCountry ?? "NOT_RELEVANT"}
                placeholder="Select country"
                options={[
                  { value: "NOT_RELEVANT", label: "Not relevant" },
                  ...RULE_COUNTRIES.map((country) => ({
                    value: country.code,
                    label: country.label,
                  })),
                ]}
                onChange={(value) =>
                  update({
                    conditionCountry:
                      value === "NOT_RELEVANT"
                        ? null
                        : (value as "ES" | "FR" | "IT"),
                  })
                }
              />
              <span className="font-medium text-muted-foreground">and</span>
              <span>Category is</span>
              <InlineSelect
                value={selectedCategoryId}
                placeholder="Select category"
                options={topLevelCategories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
                onChange={(categoryId) =>
                  update({ categoryIds: categoryId ? [categoryId] : [] })
                }
              />
              <span className="font-medium text-muted-foreground">and</span>
              <span>Subcategory is</span>
              <InlineSelect
                value={selectedSubcategoryId || "__any__"}
                placeholder={
                  selectedCategoryId
                    ? "Any subcategory"
                    : "Select category first"
                }
                disabled={!selectedCategoryId}
                options={[
                  { value: "__any__", label: "Any subcategory" },
                  ...subcategories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ]}
                onChange={(subcategoryId) =>
                  update({
                    categoryIds: selectedCategoryId
                      ? [
                          selectedCategoryId,
                          ...(subcategoryId === "__any__"
                            ? []
                            : [subcategoryId]),
                        ]
                      : [],
                  })
                }
              />
              <span className="font-medium text-muted-foreground">and</span>
              <span>Target is</span>
              <InlineSelect
                value={normalized.audienceTargetIds?.[0] ?? "__everyone__"}
                placeholder="Everyone"
                options={[
                  { value: "__everyone__", label: "Everyone" },
                  ...audienceTargets.map((target) => ({
                    value: target.id,
                    label: target.name,
                  })),
                ]}
                onChange={(targetId) =>
                  update({
                    audienceTargetIds:
                      targetId === "__everyone__" ? [] : [targetId],
                  })
                }
              />
              <span className="font-medium text-muted-foreground">then</span>
              <ActionPicker
                agentId={agentId}
                value={normalized.action}
                onChange={(value) =>
                  update({
                    action: value,
                    escalationTrigger: actionIsEscalation(value)
                      ? true
                      : normalized.escalationTrigger,
                  })
                }
              />
            </div>

            <div className="ml-4 mt-3 space-y-4 border-l-2 border-primary/25 pl-4">
              {needsSource && (
                <MultiCheckList
                  label={
                    actionKind.includes("live data")
                      ? "Data sources"
                      : "Knowledge sources"
                  }
                  hint="Choose only the sources this action needs."
                  options={sources.map((source) => ({
                    id: source.id,
                    name: source.name,
                  }))}
                  values={normalized.sourceIds ?? []}
                  onChange={(sourceIds) => update({ sourceIds })}
                  emptyMessage="No sources are available for this agent."
                />
              )}
              {needsEndpoint && (
                <div className="space-y-4">
                  <SectionHeading
                    title="API endpoint"
                    description="Enter the API endpoint that should be called to access or update data."
                  />
                  <div className="grid items-start gap-x-6 gap-y-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                    <FieldLabelWithInfo
                      label="Method"
                      tooltip="HTTP method used to call the endpoint."
                    />
                    <Select
                      value={normalizeHttpMethod(normalized.httpMethod)}
                      onValueChange={(value) =>
                        update({ httpMethod: normalizeHttpMethod(value) })
                      }
                    >
                      <SelectTrigger className="h-9 w-28 bg-card">
                        <SelectValue placeholder="GET" />
                      </SelectTrigger>
                      <SelectContent>
                        {HTTP_METHODS.map((method) => (
                          <SelectItem key={method} value={method}>
                            {method}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldLabelWithInfo
                      label="HTTPS URL"
                      tooltip="The endpoint must use HTTPS."
                    />
                    <div className="min-w-0">
                      <Input
                        value={normalized.endpointUrl ?? ""}
                        onChange={(event) =>
                          update({ endpointUrl: event.target.value })
                        }
                        placeholder="Enter"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Example: https://example.com/api/v1/
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {(actionKind.includes("template") ||
                actionKind.includes("generate")) && (
                <Field
                  label="Template"
                  hint="Instructions for the answer generated from this template."
                >
                  <Textarea
                    value={normalized.promptTemplate}
                    onChange={(event) =>
                      update({ promptTemplate: event.target.value })
                    }
                    placeholder="Answer clearly using the configured template..."
                    className="min-h-20 resize-y"
                  />
                </Field>
              )}
              {actionKind.includes("clarif") && (
                <Field label="Clarification question">
                  <Textarea
                    value={normalized.requiresClarificationPrompt}
                    onChange={(event) =>
                      update({
                        requiresClarificationPrompt: event.target.value,
                      })
                    }
                    placeholder="Could you share your order number?"
                    className="min-h-20 resize-y"
                  />
                </Field>
              )}
              {actionKind.includes("escalat") && (
                <p className="text-xs text-muted-foreground">
                  This action will hand the conversation to a human agent.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 px-1">
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

          <div className="rounded-lg border border-primary/20 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-primary">Rule preview</p>
                <p className="mt-1 text-sm leading-6">
                  {formatRuleSentence({
                    operator: normalized.conditionOperator,
                    categoryNames:
                      previewCategoryNames.length > 0
                        ? previewCategoryNames
                        : (normalized.categoryIds ?? []).map(
                            (id) => categoryNames[id] ?? id,
                          ),
                    action: normalized.action,
                    sourceNames: (normalized.sourceIds ?? []).map(
                      (id) => sourceNames[id] ?? id,
                    ),
                    requiresSource: needsSource,
                    audienceTargetNames: (
                      normalized.audienceTargetIds ?? []
                    ).map((id) => targetNames[id] ?? id),
                    countryLabel: selectedCountry?.label,
                    httpMethod: normalized.httpMethod,
                    endpointUrl: normalized.endpointUrl,
                    promptTemplate: normalized.promptTemplate,
                    clarificationPrompt: normalized.requiresClarificationPrompt,
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
          {canSave
            ? "Ready to save this rule."
            : "Add a name and at least one category or subcategory to save."}
        </p>
        <MutatingControls>
          <Button type="submit" disabled={saving || !canSave}>
            <Save className="h-4 w-4" />
            Save rule
          </Button>
        </MutatingControls>
      </div>
    </form>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function FieldLabelWithInfo({
  label,
  tooltip,
}: {
  label: string;
  tooltip: string;
}) {
  return (
    <div className="flex h-9 items-center gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            aria-label={tooltip}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function InlineSelect({
  value,
  placeholder,
  options,
  onChange,
  disabled,
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="inline-flex h-8 w-auto min-w-32 bg-card px-2.5 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
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
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
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
  const parentIds = useMemo(
    () => new Set(parents.map((category) => category.id)),
    [parents],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const orphaned = useMemo(
    () =>
      categories.filter(
        (category) => category.parentId && !parentIds.has(category.parentId),
      ),
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
        Subcategories are nested inside their parent category. Select a
        category, a subcategory, or both.
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
              <div
                key={parent.id}
                className="overflow-hidden rounded-md border border-border bg-card"
              >
                <label className="flex cursor-pointer items-center gap-2 bg-muted/40 px-3 py-2">
                  <Checkbox
                    checked={values.includes(parent.id)}
                    onCheckedChange={(checked) =>
                      toggle(parent.id, checked === true)
                    }
                  />
                  <FolderTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {parent.name}
                  </span>
                  <Badge
                    variant="outline"
                    className="h-5 shrink-0 text-[10px] font-medium"
                  >
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
                        <label
                          key={child.id}
                          className="flex min-w-0 cursor-pointer items-center gap-2 py-0.5"
                        >
                          <Checkbox
                            checked={values.includes(child.id)}
                            onCheckedChange={(checked) =>
                              toggle(child.id, checked === true)
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-xs">
                            {child.name}
                          </span>
                          <Badge
                            variant="secondary"
                            className="h-5 shrink-0 text-[10px] font-normal"
                          >
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
                <p className="text-xs font-medium">
                  Subcategories without a parent
                </p>
              </div>
              <div className="space-y-1.5 px-3 py-2">
                {orphaned.map((child) => (
                  <label
                    key={child.id}
                    className="flex min-w-0 cursor-pointer items-center gap-2"
                  >
                    <Checkbox
                      checked={values.includes(child.id)}
                      onCheckedChange={(checked) =>
                        toggle(child.id, checked === true)
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {child.name}
                    </span>
                    <Badge
                      variant="secondary"
                      className="h-5 shrink-0 text-[10px] font-normal"
                    >
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
        <p className="text-[11px] text-muted-foreground">
          {selectedCount} selected
        </p>
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
    const next = checked
      ? [...new Set([...values, id])]
      : values.filter((value) => value !== id);
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
      {options.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid max-h-36 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex min-w-0 items-center gap-2 text-xs"
            >
              <Checkbox
                checked={values.includes(option.id)}
                onCheckedChange={(checked) =>
                  toggle(option.id, checked === true)
                }
              />
              <span className="truncate">{option.name}</span>
            </label>
          ))}
        </div>
      )}
      {values.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {values.length} selected
        </p>
      ) : null}
    </div>
  );
}

function ActionPicker({
  agentId,
  value,
  onChange,
}: {
  agentId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const vocabularies = useListRuleVocabularies({ agentId, kind: "action" });
  const entries = useMemo(() => {
    const unique: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const item of vocabularies.data ?? []) {
      const key = item.label.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    const current = value.trim();
    const currentKey = current.toLowerCase();
    if (current && !seen.has(currentKey)) {
      return [{ id: `current-${current}`, label: current }, ...unique];
    }
    return unique;
  }, [value, vocabularies.data]);

  return (
    <div className="space-y-1.5">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose action" />
        </SelectTrigger>
        <SelectContent>
          {entries.map((entry) => (
            <SelectItem key={entry.label} value={entry.label}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
