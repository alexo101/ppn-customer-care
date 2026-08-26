import { useEffect, useMemo, useRef, useState } from "react";
import {
  useBulkCreateTrainingQuestions,
  useCreateTrainingQuestion,
  useDeleteTrainingQuestion,
  useListTrainingQuestions,
  useUpdateTrainingQuestion,
  getListTrainingQuestionsQueryKey,
  type TrainingQuestion,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Download,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash,
  Upload,
  X,
} from "lucide-react";
import { SupportChatPanel } from "@/components/chat/support-chat-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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
import { parseQuestionsCsv } from "@/lib/parse-questions-csv";
import {
  MAX_TRAINING_QUESTION_LENGTH,
  MAX_TRAINING_QUESTIONS,
  TRAINING_CSV_TEMPLATE,
} from "@/lib/training";
import { cn } from "@/lib/utils";
import { MutatingControls, useWorkspaceAccess } from "@/components/workspace-access";

function apiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return error.message.replace(/^HTTP \d+\s[^:]+:\s*/, "") || fallback;
}

export function TrainingEditor({ agentId }: { agentId: string }) {
  const { canEdit } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const { data: questions = [], isLoading } = useListTrainingQuestions({ agentId });
  const createQuestion = useCreateTrainingQuestion();
  const updateQuestion = useUpdateTrainingQuestion();
  const deleteQuestion = useDeleteTrainingQuestion();
  const bulkCreate = useBulkCreateTrainingQuestions();

  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [questionToDelete, setQuestionToDelete] = useState<TrainingQuestion | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  const csvRef = useRef<HTMLInputElement>(null);

  const selected = questions.find((question) => question.id === selectedId) ?? null;
  const remaining = Math.max(0, MAX_TRAINING_QUESTIONS - questions.length);
  const atLimit = remaining === 0;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return questions;
    return questions.filter((question) => question.content.toLowerCase().includes(query));
  }, [questions, search]);

  useEffect(() => {
    if (selectedId && !questions.some((question) => question.id === selectedId)) {
      setSelectedId(null);
    }
  }, [questions, selectedId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListTrainingQuestionsQueryKey({ agentId }) });
  };

  const handleAdd = () => {
    if (!canEdit) return;
    const content = draft.trim();
    if (!content || atLimit || createQuestion.isPending) return;

    createQuestion.mutate(
      { data: { agentId, content } },
      {
        onSuccess: (created) => {
          setDraft("");
          setSelectedId(created.id);
          invalidate();
          toast({ title: "Question added" });
        },
        onError: (error) => {
          toast({
            title: "Could not add question",
            description: apiErrorMessage(error, "Try again."),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleSaveEdit = (id: string) => {
    if (!canEdit) return;
    const content = editingText.trim();
    if (!content) return;

    updateQuestion.mutate(
      { id, data: { content } },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        },
        onError: (error) => {
          toast({
            title: "Could not update question",
            description: apiErrorMessage(error, "Try again."),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!canEdit || !questionToDelete) return;
    deleteQuestion.mutate(
      { id: questionToDelete.id },
      {
        onSuccess: () => {
          if (selectedId === questionToDelete.id) setSelectedId(null);
          setQuestionToDelete(null);
          invalidate();
        },
        onError: (error) => {
          toast({
            title: "Could not delete question",
            description: apiErrorMessage(error, "Try again."),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleCsv = async (file: File) => {
    if (!canEdit) return;
    const text = await file.text();
    const parsed = parseQuestionsCsv(text);
    if (parsed.length === 0) {
      toast({
        title: "No questions found",
        description: "Use a CSV with one question per row, or a question column header.",
        variant: "destructive",
      });
      return;
    }

    bulkCreate.mutate(
      { data: { agentId, questions: parsed.slice(0, MAX_TRAINING_QUESTIONS) } },
      {
        onSuccess: (result) => {
          invalidate();
          if (result.created[0]) setSelectedId(result.created[0].id);

          if (result.created.length === 0 && result.limitReached) {
            toast({
              title: "Limit reached",
              description: `This agent already has ${MAX_TRAINING_QUESTIONS} questions.`,
              variant: "destructive",
            });
            return;
          }

          const extras = [
            result.created.length === 1
              ? "Imported 1 question."
              : `Imported ${result.created.length} questions.`,
            result.skipped > 0 ? `${result.skipped} skipped.` : null,
            result.limitReached ? `Stopped at ${MAX_TRAINING_QUESTIONS}.` : null,
          ].filter(Boolean);

          toast({ title: extras.join(" ") });
        },
        onError: (error) => {
          toast({
            title: "Could not import CSV",
            description: apiErrorMessage(error, "Try again."),
            variant: "destructive",
          });
        },
      },
    );
  };

  const downloadTemplate = () => {
    const blob = new Blob([TRAINING_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "training-questions.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row overflow-hidden">
      <div className="flex-1 min-w-0 min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-background">
        <div className="px-6 py-4 border-b border-border space-y-3 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                Add up to {MAX_TRAINING_QUESTIONS} questions for this agent to attempt to answer. Select one to test it in the customer chat preview.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-medium tabular-nums">
                {questions.length} / {MAX_TRAINING_QUESTIONS}
              </div>
              <div className="text-[11px] text-muted-foreground">questions</div>
            </div>
          </div>
          <Progress value={(questions.length / MAX_TRAINING_QUESTIONS) * 100} className="h-1.5" />

          <MutatingControls>
          <div className="flex flex-col sm:flex-row gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_TRAINING_QUESTION_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="Write a question, then press Enter to add it"
              disabled={atLimit}
              className="min-h-[72px] text-sm bg-background resize-none"
            />
            <div className="flex sm:flex-col gap-2 shrink-0">
              <Button
                className="h-9 text-xs"
                onClick={handleAdd}
                disabled={atLimit || !draft.trim() || createQuestion.isPending}
              >
                {createQuestion.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5 mr-1" />
                )}
                Add
              </Button>
              <Button
                variant="outline"
                className="h-9 text-xs"
                onClick={() => csvRef.current?.click()}
                disabled={atLimit || bulkCreate.isPending}
              >
                {bulkCreate.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 mr-1" />
                )}
                CSV
              </Button>
              <input
                ref={csvRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleCsv(file);
                }}
              />
            </div>
          </div>
          </MutatingControls>

          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions..."
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] px-2" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Template
            </Button>
          </div>
          {atLimit ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              This agent is at the {MAX_TRAINING_QUESTIONS}-question limit.
              {canEdit ? " Delete a question to add more." : ""}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              CSV: one question per row, or a column named question. {remaining} remaining.
            </p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading questions...</p>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground space-y-1">
              <p>{questions.length === 0 ? "No training questions yet." : "No questions match that search."}</p>
              {questions.length === 0 ? (
                <p>Add one manually or upload a CSV to start testing the agent.</p>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((question, index) => {
                const isSelected = question.id === selectedId;
                const isEditing = question.id === editingId;
                return (
                  <div
                    key={question.id}
                    className={cn(
                      "group px-6 py-3 flex items-start gap-3 cursor-pointer",
                      isSelected ? "bg-primary/10" : "hover:bg-muted/60",
                    )}
                    onClick={() => {
                      if (isEditing) return;
                      setSelectedId(question.id);
                    }}
                  >
                    <div
                      className={cn(
                        "mt-0.5 w-5 h-5 rounded-full border text-[10px] font-medium flex items-center justify-center shrink-0",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </div>
                    {isEditing ? (
                      <div className="flex-1 min-w-0 flex items-start gap-2" onClick={(e) => e.stopPropagation()}>
                        <Textarea
                          autoFocus
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value.slice(0, MAX_TRAINING_QUESTION_LENGTH))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveEdit(question.id);
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="min-h-[64px] text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-600"
                          onClick={() => handleSaveEdit(question.id)}
                          disabled={!editingText.trim() || updateQuestion.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="flex-1 min-w-0 text-sm leading-5">{question.content}</p>
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                          {canEdit ? (
                          <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(question.id);
                              setEditingText(question.content);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuestionToDelete(question);
                            }}
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </Button>
                          </>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="lg:w-[400px] xl:w-[440px] shrink-0 bg-muted/30 flex flex-col min-h-[520px] lg:min-h-0">
        <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card">
          <div className="min-w-0">
            <div className="text-sm font-medium">Customer chat preview</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {selected ? "Testing the selected question" : "Select a question to run a test"}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!selected}
            onClick={() => setRunNonce((value) => value + 1)}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Run again
          </Button>
        </div>
        <div className="flex-1 p-4 min-h-0">
          <div className="h-full rounded-xl border border-black/10 shadow-lg overflow-hidden">
            <SupportChatPanel
              agentId={agentId}
              source="training"
              seedKey={selected?.id}
              seedMessage={selected?.content}
              runNonce={runNonce}
              className="h-full"
            />
          </div>
        </div>
      </div>

      <AlertDialog open={canEdit && !!questionToDelete} onOpenChange={(open) => !open && setQuestionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              {questionToDelete?.content}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteQuestion.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
