import { useMemo, useState } from "react";
import {
  useListTargets,
  useCreateTarget,
  useUpdateTarget,
  useDeleteTarget,
  getListTargetsQueryKey,
  type Target,
  type TargetConditionInput,
  type TargetMatchMode,
  type TargetPersonType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ATTRIBUTE_LABELS,
  ATTRIBUTES_BY_PERSON,
  OPERATOR_LABELS,
  OPERATORS,
  PERSON_TYPE_DEFINITIONS,
  PERSON_TYPE_LABELS,
  VALUELESS_OPERATORS,
  EVERYONE_TARGET_NAME,
  coerceAttribute,
  defaultCondition,
  formatCondition,
  isCatchAllTarget,
} from "@/lib/targets";
import { MutatingControls, useWorkspaceAccess } from "@/components/workspace-access";

function emptyForm(): {
  name: string;
  description: string;
  matchMode: TargetMatchMode;
  isEnabled: boolean;
  conditions: TargetConditionInput[];
} {
  return {
    name: "",
    description: "",
    matchMode: "all",
    isEnabled: true,
    conditions: [defaultCondition("user")],
  };
}

export function TargetsTab({ agentId }: { agentId: string }) {
  const { canEdit } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const { data: targets = [] } = useListTargets({ agentId });
  const createTarget = useCreateTarget();
  const updateTarget = useUpdateTarget();
  const deleteTarget = useDeleteTarget();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Target | null>(null);
  const [toDelete, setToDelete] = useState<Target | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [matchMode, setMatchMode] = useState<TargetMatchMode>("all");
  const [isEnabled, setIsEnabled] = useState(true);
  const [conditions, setConditions] = useState<TargetConditionInput[]>([defaultCondition("user")]);

  const saving = createTarget.isPending || updateTarget.isPending;
  const targetsQueryKey = getListTargetsQueryKey({ agentId });
  const invalidate = () => {
    return queryClient.invalidateQueries({ queryKey: targetsQueryKey });
  };

  const resetForm = (target?: Target | null) => {
    const next = target
      ? {
          name: target.name,
          description: target.description,
          matchMode: target.matchMode,
          isEnabled: target.isEnabled,
          conditions: target.conditions.map((condition) => ({
            personType: condition.personType,
            attribute: condition.attribute,
            operator: condition.operator,
            value: condition.value,
          })),
        }
      : emptyForm();
    setEditing(target ?? null);
    setName(next.name);
    setDescription(next.description);
    setMatchMode(next.matchMode);
    setIsEnabled(next.isEnabled);
    setConditions(next.conditions);
  };

  const openCreate = () => {
    if (!canEdit) return;
    resetForm(null);
    setOpen(true);
  };

  const openEdit = (target: Target) => {
    if (!canEdit) return;
    resetForm(target);
    setOpen(true);
  };

  const updateCondition = (index: number, patch: Partial<TargetConditionInput>) => {
    setConditions((current) =>
      current.map((condition, i) => {
        if (i !== index) return condition;
        const personType = (patch.personType ?? condition.personType) as TargetPersonType;
        const attribute = coerceAttribute(personType, patch.attribute ?? condition.attribute);
        const operator = patch.operator
          ?? (attribute === "phone_number_prefix" && condition.attribute !== "phone_number_prefix"
            ? "starts_with"
            : condition.operator);
        return {
          ...condition,
          ...patch,
          personType,
          attribute,
          operator,
          value: VALUELESS_OPERATORS.has(operator) ? "" : (patch.value ?? condition.value),
        };
      }),
    );
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: "Name this target", variant: "destructive" });
      return;
    }
    const payload = {
      name: trimmedName,
      description: description.trim(),
      matchMode,
      isEnabled,
      conditions: conditions.map((condition) => ({
        ...condition,
        value: VALUELESS_OPERATORS.has(condition.operator) ? "" : (condition.value ?? "").trim(),
      })),
    };

    const onSuccess = () => {
      invalidate();
      toast({ title: editing ? "Target updated" : "Target created" });
      setOpen(false);
      resetForm(null);
    };
    const onError = (error: unknown) => {
      toast({
        title: "Could not save target",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    };

    if (editing) {
      updateTarget.mutate({ id: editing.id, data: payload }, { onSuccess, onError });
      return;
    }
    createTarget.mutate({ data: { ...payload, agentId } }, { onSuccess, onError });
  };

  const handleConfirmDelete = () => {
    if (!canEdit || !toDelete) return;
    const targetToDelete = toDelete;
    deleteTarget.mutate(
      { id: targetToDelete.id },
      {
        onSuccess: () => {
          queryClient.setQueryData<Target[]>(targetsQueryKey, (current) =>
            current?.filter((target) => target.id !== targetToDelete.id) ?? current,
          );
          void invalidate();
          toast({ title: "Target removed", description: `Deleted "${targetToDelete.name}"` });
          setToDelete(null);
        },
        onError: (error) => {
          toast({
            title: "Could not delete target",
            description: error instanceof Error ? error.message : "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const exampleHint = useMemo(
    () => ["User email contains mydomain.com", "Lead phone number prefix starts with +34"],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h2 className="font-semibold text-base tracking-tight">Who this agent talks to</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Name an audience, then describe it with operators such as{" "}
            <span className="font-medium text-foreground">user email contains mydomain.com</span> or{" "}
            <span className="font-medium text-foreground">lead phone number prefix starts with +34</span>.
            Every agent starts with an <span className="font-medium text-foreground">Everyone</span> target that does not filter by any criteria.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PERSON_TYPE_DEFINITIONS.map((person) => (
            <div key={person.id} className="rounded-lg border border-border bg-card p-4">
              <div className="text-sm font-medium">{person.label}</div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{person.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="font-semibold text-base tracking-tight">Targets</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
              {targets.length}
            </span>
          </div>
          <MutatingControls>
            <Button size="sm" className="h-8 text-xs" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add target
            </Button>
          </MutatingControls>
        </div>

        {targets.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            No targets yet. Create one to match visitors, leads, or users.
          </p>
        ) : (
          <div className="space-y-2.5">
            {targets.map((target) => {
              const summary = (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate">{target.name}</span>
                    <Badge variant="outline" className="text-xs h-5 shrink-0">
                      {isCatchAllTarget(target)
                        ? "No filters"
                        : target.matchMode === "all"
                          ? "Match all"
                          : "Match any"}
                    </Badge>
                  </div>
                  {target.description ? (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{target.description}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {isCatchAllTarget(target) ? (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        Matches everyone
                      </Badge>
                    ) : (
                      target.conditions.map((condition) => (
                        <Badge key={condition.id} variant="secondary" className="text-[10px] font-normal">
                          {formatCondition(condition)}
                        </Badge>
                      ))
                    )}
                  </div>
                </>
              );

              return (
              <div
                key={target.id}
                className="group rounded-lg p-3 flex items-start justify-between gap-3 border border-border/80 bg-card shadow-sm"
              >
                {canEdit ? (
                  <button
                    type="button"
                    className="min-w-0 text-left flex-1"
                    onClick={() => openEdit(target)}
                  >
                    {summary}
                  </button>
                ) : (
                  <div className="min-w-0 text-left flex-1">{summary}</div>
                )}
                <div className="flex items-center gap-3 shrink-0 pt-0.5">
                  {canEdit ? (
                    <Switch
                      checked={target.isEnabled}
                      onCheckedChange={(checked) => {
                        updateTarget.mutate(
                          { id: target.id, data: { isEnabled: checked } },
                          {
                            onSuccess: invalidate,
                            onError: (error) => {
                              toast({
                                title: "Could not update target",
                                description: error instanceof Error ? error.message : "Try again.",
                                variant: "destructive",
                              });
                            },
                          },
                        );
                      }}
                    />
                  ) : (
                    <Badge variant={target.isEnabled ? "default" : "secondary"} className="text-[10px]">
                      {target.isEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  )}
                  {canEdit && target.name !== EVERYONE_TARGET_NAME ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-60 group-hover:opacity-100"
                    onClick={() => setToDelete(target)}
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </Button>
                  ) : null}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={canEdit && open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetForm(null);
        }}
      >
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit target" : "Name a target"}</DialogTitle>
            <DialogDescription>
              Examples: {exampleHint.join("; ")}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="target-name" className="text-xs">Target name</Label>
                <Input
                  id="target-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Spanish company users"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Match</Label>
                <Select
                  value={matchMode}
                  onValueChange={(value) => setMatchMode(value as TargetMatchMode)}
                  disabled={conditions.length === 0}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All conditions</SelectItem>
                    <SelectItem value="any">Any condition</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-description" className="text-xs">Description (optional)</Label>
              <Input
                id="target-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Who this audience is for"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Conditions</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setConditions((current) => [...current, defaultCondition(current.at(-1)?.personType ?? "user")])}
                  disabled={conditions.length >= 20}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add condition
                </Button>
              </div>
              <div className="space-y-2">
                {conditions.length === 0 ? (
                  <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-4 text-center">
                    No filters. This target matches everyone.
                  </p>
                ) : null}
                {conditions.map((condition, index) => {
                  const attributes = ATTRIBUTES_BY_PERSON[condition.personType];
                  const needsValue = !VALUELESS_OPERATORS.has(condition.operator);
                  return (
                    <div key={`${condition.personType}-${index}`} className="rounded-md border border-border p-2.5 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_minmax(0,9.5rem)_auto] gap-2 items-center">
                        <Select
                          value={condition.personType}
                          onValueChange={(value) => updateCondition(index, { personType: value as TargetPersonType })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(PERSON_TYPE_LABELS) as TargetPersonType[]).map((personType) => (
                              <SelectItem key={personType} value={personType}>
                                {PERSON_TYPE_LABELS[personType]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={condition.attribute}
                          onValueChange={(value) => updateCondition(index, { attribute: value as TargetConditionInput["attribute"] })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {attributes.map((attribute) => (
                              <SelectItem key={attribute} value={attribute}>
                                {ATTRIBUTE_LABELS[attribute]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={condition.operator}
                          onValueChange={(value) => updateCondition(index, { operator: value as TargetConditionInput["operator"] })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERATORS.map((operator) => (
                              <SelectItem key={operator} value={operator}>
                                {OPERATOR_LABELS[operator]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}
                          aria-label="Remove condition"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {needsValue && (
                        <Input
                          value={condition.value ?? ""}
                          onChange={(e) => updateCondition(index, { value: e.target.value })}
                          placeholder={
                            condition.attribute === "phone_number_prefix"
                              ? "+34"
                              : condition.attribute === "email"
                                ? "mydomain.com"
                                : "Value"
                          }
                          className="h-8 text-xs"
                          required
                        />
                      )}
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {formatCondition({
                          personType: condition.personType,
                          attribute: condition.attribute,
                          operator: condition.operator,
                          value: condition.value ?? "",
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="target-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
              <Label htmlFor="target-enabled" className="text-xs">Enabled</Label>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving || !name.trim()}>
                {editing ? "Save changes" : "Save target"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={canEdit && Boolean(toDelete)} onOpenChange={(next) => !next && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete target</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">"{toDelete?.name}"</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete target
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
