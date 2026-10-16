import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListArticlesQueryKey,
  useArchiveArticle,
  useCreateArticle,
  useDeleteArticle,
  useListArticles,
  useListTargets,
  usePublishArticle,
  useRestoreArticleDraft,
  useUpdateArticle,
  type KnowledgeArticle,
} from "@workspace/api-client-react";
import { Archive, FileText, MoreVertical, Trash } from "lucide-react";
import { ArticleEditor } from "@/components/article-editor";
import { MutatingControls, useWorkspaceAccess } from "@/components/workspace-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ALL = "all";
const NO_TARGET = "none";

const STATUS_LABELS = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
} as const;

function indexBadge(article: KnowledgeArticle) {
  if (article.status !== "published") return null;
  if (article.indexStatus === "ready") return { label: "Indexed", className: "text-emerald-500" };
  if (article.indexStatus === "indexing" || article.indexStatus === "idle") {
    return { label: "Indexing", className: "text-amber-500" };
  }
  if (article.indexStatus === "empty") return { label: "No content", className: "text-muted-foreground" };
  if (article.indexStatus === "error") return { label: "Index failed", className: "text-destructive" };
  return { label: "Pending", className: "text-muted-foreground" };
}

export function KnowledgeBaseTab({ agentId }: { agentId: string }) {
  const { canEdit } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const { data: articles = [], isLoading, isError } = useListArticles({ agentId });
  const { data: targets = [] } = useListTargets({ agentId });
  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle();
  const publishArticle = usePublishArticle();
  const archiveArticle = useArchiveArticle();
  const restoreDraft = useRestoreArticleDraft();
  const deleteArticle = useDeleteArticle();
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [targetFilter, setTargetFilter] = useState(ALL);
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [targetId, setTargetId] = useState(NO_TARGET);
  const [articleToDelete, setArticleToDelete] = useState<KnowledgeArticle | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListArticlesQueryKey({ agentId }) });
  };

  useEffect(() => {
    const pending = articles.some(
      (article) => article.status === "published" && (article.indexStatus === "idle" || article.indexStatus === "indexing"),
    );
    if (!pending) return;
    const timer = window.setInterval(invalidate, 2500);
    return () => window.clearInterval(timer);
  }, [articles, agentId, queryClient]);

  const visibleArticles = useMemo(
    () =>
      articles.filter((article) => {
        if (statusFilter !== ALL && article.status !== statusFilter) return false;
        if (targetFilter === ALL) return true;
        if (targetFilter === NO_TARGET) return !article.targetId;
        return article.targetId === targetFilter;
      }),
    [articles, statusFilter, targetFilter],
  );

  const dirty = Boolean(
    editing &&
      (title !== editing.title ||
        description !== (editing.description ?? "") ||
        bodyHtml !== editing.bodyHtml ||
        (targetId === NO_TARGET ? null : targetId) !== editing.targetId),
  );

  const openArticle = (article: KnowledgeArticle) => {
    setEditing(article);
    setTitle(article.title);
    setDescription(article.description ?? "");
    setBodyHtml(article.bodyHtml);
    setTargetId(article.targetId ?? NO_TARGET);
  };

  const closeEditor = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setEditing(null);
  };

  const handleError = (error: unknown) => {
    toast({
      title: "Could not update the article",
      description: error instanceof Error ? error.message : "Try again.",
      variant: "destructive",
    });
  };

  const handleCreate = () => {
    createArticle.mutate(
      { data: { agentId, title: "Untitled article", bodyHtml: "<p></p>" } },
      {
        onSuccess: (article) => {
          invalidate();
          openArticle(article);
        },
        onError: handleError,
      },
    );
  };

  const handleSave = (exit = false) => {
    if (!editing || !canEdit) return;
    updateArticle.mutate(
      {
        id: editing.id,
        data: {
          title: title.trim(),
          description: (description ?? "").trim(),
          bodyHtml,
          targetId: targetId === NO_TARGET ? null : targetId,
        },
      },
      {
        onSuccess: (article) => {
          invalidate();
          if (exit) setEditing(null);
          else openArticle(article);
          toast({ title: "Article saved" });
        },
        onError: handleError,
      },
    );
  };

  const runLifecycle = (
    action: "publish" | "archive" | "draft",
    article: KnowledgeArticle,
  ) => {
    const mutation = action === "publish" ? publishArticle : action === "archive" ? archiveArticle : restoreDraft;
    mutation.mutate(
      { id: article.id },
      {
        onSuccess: (updated) => {
          invalidate();
          if (editing?.id === updated.id) openArticle(updated);
          toast({
            title: action === "publish" ? "Article published" : action === "archive" ? "Article archived" : "Moved to draft",
          });
        },
        onError: handleError,
      },
    );
  };

  const handleDelete = () => {
    if (!articleToDelete) return;
    deleteArticle.mutate(
      { id: articleToDelete.id },
      {
        onSuccess: () => {
          invalidate();
          if (editing?.id === articleToDelete.id) setEditing(null);
          toast({ title: "Article deleted" });
          setArticleToDelete(null);
        },
        onError: handleError,
      },
    );
  };

  const handlePublish = async () => {
    if (!editing || !canEdit) return;
    try {
      const saved = await updateArticle.mutateAsync({
        id: editing.id,
        data: {
          title: title.trim(),
          description: (description ?? "").trim(),
          bodyHtml,
          targetId: targetId === NO_TARGET ? null : targetId,
        },
      });
      const published = await publishArticle.mutateAsync({ id: saved.id });
      invalidate();
      openArticle(published);
      toast({ title: "Article published" });
    } catch (error) {
      handleError(error);
    }
  };

  const saving = updateArticle.isPending || publishArticle.isPending || archiveArticle.isPending || restoreDraft.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Knowledge Base</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Write an article once. Published articles answer questions for the selected target.
          </p>
        </div>
        <MutatingControls>
          <Button onClick={handleCreate} disabled={createArticle.isPending}>
            New article
          </Button>
        </MutatingControls>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Articles</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {visibleArticles.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="draft">Drafts</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={targetFilter} onValueChange={setTargetFilter}>
              <SelectTrigger className="h-8 w-40 text-xs" aria-label="Filter by target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All targets</SelectItem>
                <SelectItem value={NO_TARGET}>No target</SelectItem>
                {targets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>{target.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading articles…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-destructive">Could not load articles.</p>
        ) : articles.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No articles yet. Create one and publish it so the assistant can use it.
          </p>
        ) : visibleArticles.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No articles match these filters.</p>
        ) : (
          <div className="space-y-2">
            {visibleArticles.map((article) => {
              const indexing = indexBadge(article);
              return (
                <div key={article.id} className="flex items-center justify-between rounded-lg border border-border/80 p-3">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openArticle(article)}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/40 bg-muted/70 text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{article.title}</span>
                        <Badge variant="outline" className="h-5 text-xs">{STATUS_LABELS[article.status]}</Badge>
                        {indexing ? (
                          <Badge variant="outline" className={cn("h-5 text-xs", indexing.className)}>{indexing.label}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {article.targetId ? targets.find((target) => target.id === article.targetId)?.name ?? "Target" : "All audiences"}
                        {article.indexError ? ` · ${article.indexError}` : ""}
                      </p>
                    </div>
                  </button>
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${article.title}`}>
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {article.status !== "published" ? (
                          <DropdownMenuItem onClick={() => runLifecycle("publish", article)}>Publish</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => runLifecycle("archive", article)}>
                            <Archive className="h-3.5 w-3.5" /> Archive
                          </DropdownMenuItem>
                        )}
                        {article.status !== "draft" ? (
                          <DropdownMenuItem onClick={() => runLifecycle("draft", article)}>Move to draft</DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setArticleToDelete(article)}>
                          <Trash className="h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="flex h-[min(55.25rem,90vh)] max-h-[90vh] w-full max-w-[min(62.4rem,calc(100vw-2rem))] flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{canEdit ? "Edit article" : "Article"}</DialogTitle>
            <DialogDescription>
              Drafts stay private. Publishing makes this article available to matching audiences.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="shrink-0 space-y-2">
                <Label htmlFor="article-title">Title</Label>
                <Input id="article-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canEdit} />
              </div>
              <div className="shrink-0 space-y-2">
                <Label htmlFor="article-target">Target</Label>
                <Select value={targetId} onValueChange={setTargetId} disabled={!canEdit}>
                  <SelectTrigger id="article-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TARGET}>No target</SelectItem>
                    {targets.map((target) => (
                      <SelectItem key={target.id} value={target.id}>{target.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="shrink-0 space-y-2">
                <Label htmlFor="article-description">Description</Label>
                <Textarea
                  id="article-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={!canEdit}
                  placeholder="Summarize what this article covers. The assistant searches this text."
                  rows={3}
                />
              </div>
              <ArticleEditor articleId={editing.id} value={bodyHtml} editable={canEdit} onChange={setBodyHtml} />
            </div>
          ) : null}
          <DialogFooter className="shrink-0 gap-2 sm:justify-between">
            <div className="flex gap-2">
              {canEdit && editing?.status !== "published" ? (
                <Button type="button" variant="outline" disabled={saving || !title.trim()} onClick={() => void handlePublish()}>
                  Publish
                </Button>
              ) : null}
              {canEdit && editing?.status === "published" ? (
                <Button type="button" variant="outline" disabled={saving} onClick={() => editing && runLifecycle("archive", editing)}>
                  Archive
                </Button>
              ) : null}
              {canEdit && editing?.status === "archived" ? (
                <Button type="button" variant="outline" disabled={saving} onClick={() => editing && runLifecycle("draft", editing)}>
                  Restore draft
                </Button>
              ) : null}
            </div>
            {canEdit ? (
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => handleSave(false)} disabled={saving || !title.trim()}>
                  Save and continue
                </Button>
                <Button type="button" onClick={() => handleSave(true)} disabled={saving || !title.trim()}>
                  Save and exit
                </Button>
              </div>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(articleToDelete)} onOpenChange={(open) => !open && setArticleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete article</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{articleToDelete?.title}"? This removes it from the knowledge base.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete article
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
