import { useEffect, useMemo, useRef, useState } from "react";
import {
  useListSources,
  useCreateSource,
  useUpdateSource,
  useDeleteSource,
  useUploadSourceDocument,
  useUploadSourceAsset,
  useListSourceAssets,
  useDeleteSourceAsset,
  useGetSourceAssetUrl,
  getGetSourceAssetUrlQueryKey,
  useCreateSourceFromUrl,
  useRefreshSource,
  getListSourcesQueryKey,
  getListSourceAssetsQueryKey,
  type KnowledgeSource,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  FileText,
  FileUp,
  Image,
  Link,
  MoreVertical,
  RefreshCw,
  Table2,
  Trash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MutatingControls, useWorkspaceAccess } from "@/components/workspace-access";

type SourceKind = "article" | "document" | "url";
type DialogKind = SourceKind | "edit-article" | null;

const SOURCE_LABELS: Record<string, string> = {
  article: "Article",
  document: "Document",
  spreadsheet: "Spreadsheet",
};

function configString(config: Record<string, unknown> | undefined, key: string) {
  const value = config?.[key];
  return typeof value === "string" ? value : "";
}

function configValue(config: Record<string, unknown> | undefined, key: string): unknown {
  return config?.[key];
}

function syncStatus(config: Record<string, unknown> | undefined) {
  const value = configString(config, "syncStatus");
  if (value === "syncing" || value === "ready" || value === "error" || value === "empty" || value === "idle") {
    return value;
  }
  return "idle";
}

function syncBadge(config: Record<string, unknown> | undefined) {
  const status = syncStatus(config);
  if (status === "ready") return { label: "Indexed", className: "text-emerald-500" };
  if (status === "syncing") return { label: "Indexing", className: "text-amber-500" };
  if (status === "idle") return { label: "Pending", className: "text-amber-500" };
  if (status === "empty") return { label: "No content", className: "text-muted-foreground" };
  if (status === "error") return { label: "Index failed", className: "text-destructive" };
  return { label: "Pending", className: "text-muted-foreground" };
}

function isIndexableSourceType(sourceType: string) {
  return sourceType === "article" || sourceType === "document" || sourceType === "spreadsheet";
}

function chunkCount(config: Record<string, unknown> | undefined) {
  const value = configValue(config, "chunkCount");
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function imageCount(config: Record<string, unknown> | undefined) {
  const value = configValue(config, "imageCount");
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function imageFailedCount(config: Record<string, unknown> | undefined) {
  const value = configValue(config, "imageFailedCount");
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function truncateUrl(url: string, max = 64) {
  let display = url.trim();
  try {
    const parsed = new URL(url);
    display = `${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    display = url.replace(/^https?:\/\//i, "");
  }
  if (display.length <= max) return display;
  return `${display.slice(0, max - 1)}…`;
}

function sourceScope(source: KnowledgeSource) {
  const config = source.connectionConfig;
  const url = configString(config, "url");
  if (url && (source.sourceType === "document" || source.sourceType === "spreadsheet")) {
    return truncateUrl(url);
  }
  if (source.sourceType === "article") {
    return configString(config, "body") || "Written article";
  }
  if (source.sourceType === "document") {
    return configString(config, "fileName") || "Word document";
  }
  if (source.sourceType === "spreadsheet") {
    return configString(config, "fileName") || "Excel spreadsheet";
  }
  return source.sourceType;
}

function sourceSummary(source: KnowledgeSource) {
  const scope = sourceScope(source);
  if (!isIndexableSourceType(source.sourceType)) return scope;
  const error = configString(source.connectionConfig, "lastError");
  if (error) return `${scope} · ${error}`;
  const status = syncStatus(source.connectionConfig);
  const chunks = chunkCount(source.connectionConfig);
  const images = imageCount(source.connectionConfig);
  const failedImages = imageFailedCount(source.connectionConfig);
  const imageLabel = images === 1 ? "1 screenshot" : `${images} screenshots`;
  const imageFailureLabel = failedImages === 1 ? "1 screenshot failed" : `${failedImages} screenshots failed`;
  if (status === "ready") {
    return `${scope} · ${chunks === 1 ? "1 chunk" : `${chunks} chunks`} indexed${images ? ` · ${imageLabel}` : ""}${failedImages ? ` · ${imageFailureLabel}` : ""}`;
  }
  if (status === "empty") return `${scope} · ${images ? imageLabel : "No indexable text"}`;
  if (status === "syncing") return `${scope} · Indexing…`;
  return `${scope} · Waiting to index`;
}

function SourceTypeIcon({ type, className }: { type: string; className?: string }) {
  const props = { className: cn("w-4 h-4", className) };
  if (type === "document") return <FileUp {...props} />;
  if (type === "spreadsheet") return <Table2 {...props} />;
  return <FileText {...props} />;
}

function LocalImagePreview({ file }: { file: File }) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  return <img src={previewUrl} alt={file.name} className="h-20 w-full rounded object-cover" />;
}

function ExistingImagePreview({ assetId, alt }: { assetId: string; alt: string }) {
  const { data } = useGetSourceAssetUrl(assetId, {
    query: { queryKey: getGetSourceAssetUrlQueryKey(assetId) },
  });
  return data?.url ? (
    <img src={data.url} alt={alt} className="h-20 w-full rounded object-cover" />
  ) : (
    <div className="flex h-20 items-center justify-center rounded bg-muted text-muted-foreground">
      <Image className="h-5 w-5" />
    </div>
  );
}

export function SourcesTab({ agentId }: { agentId: string }) {
  const { canEdit } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const { data: sources = [] } = useListSources({ agentId });
  const createSource = useCreateSource();
  const updateSource = useUpdateSource();
  const deleteSource = useDeleteSource();
  const uploadDocument = useUploadSourceDocument();
  const uploadAsset = useUploadSourceAsset();
  const deleteAsset = useDeleteSourceAsset();
  const createFromUrl = useCreateSourceFromUrl();
  const refreshSource = useRefreshSource();

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [editing, setEditing] = useState<KnowledgeSource | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<KnowledgeSource | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { data: existingAssets = [] } = useListSourceAssets(editing?.id ?? "", {
    query: {
      enabled: Boolean(editing?.id),
      queryKey: getListSourceAssetsQueryKey(editing?.id ?? ""),
    },
  });

  const saving =
    createSource.isPending ||
    updateSource.isPending ||
    uploadDocument.isPending ||
    createFromUrl.isPending;

  const invalidateSources = () => {
    queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey({ agentId }) });
  };

  useEffect(() => {
    const pending = sources.some((source) => {
      if (!isIndexableSourceType(source.sourceType)) return false;
      const status = syncStatus(source.connectionConfig);
      return status === "idle" || status === "syncing";
    });
    if (!pending) return;
    const timer = window.setInterval(invalidateSources, 2500);
    return () => window.clearInterval(timer);
  }, [sources, agentId, queryClient]);

  const resetDialog = () => {
    setDialog(null);
    setEditing(null);
    setTitle("");
    setBody("");
    setFile(null);
    setSourceUrl("");
    setImageFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const openAdd = (kind: SourceKind) => {
    setEditing(null);
    setTitle("");
    setBody("");
    setFile(null);
    setSourceUrl("");
    setImageFiles([]);
    setDialog(kind);
  };

  const openEdit = (source: KnowledgeSource) => {
    if (!canEdit) return;
    if (source.sourceType === "article") {
      setEditing(source);
      setTitle(source.name);
      setBody(configString(source.connectionConfig, "body"));
      setDialog("edit-article");
    }
  };

  const handleCreateError = (error: unknown) => {
    toast({
      title: "Could not add source",
      description: error instanceof Error ? error.message : "Try again.",
      variant: "destructive",
    });
  };

  const handleSaveArticle = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    const name = title.trim();
    const content = body.trim();
    if (!name || (!content && imageFiles.length === 0)) return;

    const uploadArticleImages = async (sourceId: string) => {
      for (const image of imageFiles) {
        await uploadAsset.mutateAsync({
          id: sourceId,
          data: { file: image, altText: image.name.replace(/\.[^.]+$/, "") },
        });
      }
    };

    const onSuccess = async (source?: KnowledgeSource) => {
      if (source && imageFiles.length > 0) {
        try {
          await uploadArticleImages(source.id);
        } catch (error) {
          handleCreateError(error);
          return;
        }
      }
      invalidateSources();
      toast({ title: editing ? "Article updated" : "Article added" });
      resetDialog();
    };

    if (editing) {
      updateSource.mutate(
        { id: editing.id, data: { name, connectionConfig: { body: content } } },
        { onSuccess: (source) => void onSuccess(source), onError: handleCreateError },
      );
      return;
    }

    createSource.mutate(
      { data: { agentId, name, sourceType: "article", connectionConfig: { body: content } } },
      { onSuccess: (source) => void onSuccess(source), onError: handleCreateError },
    );
  };

  const handleUploadDocument = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!file) {
      toast({ title: "Choose a .docx or .xlsx file", variant: "destructive" });
      return;
    }

    uploadDocument.mutate(
      { data: { agentId, name: title.trim() || undefined, file } },
      {
        onSuccess: () => {
          invalidateSources();
          toast({ title: "Document uploaded" });
          resetDialog();
        },
        onError: handleCreateError,
      },
    );
  };

  const handleCreateFromUrl = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    const url = sourceUrl.trim();
    if (!url) {
      toast({ title: "Paste a Google Doc or Sheet link", variant: "destructive" });
      return;
    }

    createFromUrl.mutate(
      { data: { agentId, url, name: title.trim() || undefined } },
      {
        onSuccess: () => {
          invalidateSources();
          toast({ title: "Link added" });
          resetDialog();
        },
        onError: handleCreateError,
      },
    );
  };

  const handleRefreshSource = (source: KnowledgeSource) => {
    if (!canEdit) return;
    refreshSource.mutate(
      { id: source.id },
      {
        onSuccess: (updated) => {
          invalidateSources();
          const status = syncStatus(updated.connectionConfig);
          const error = configString(updated.connectionConfig, "lastError");
          if (status === "error" || error) {
            toast({
              title: "Indexing failed",
              description: error || "The source could not be indexed.",
              variant: "destructive",
            });
            return;
          }
          const chunks = chunkCount(updated.connectionConfig);
          toast({
            title: status === "empty" ? "No content to index" : "Source indexed",
            description:
              status === "empty"
                ? "This source has no indexable text."
                : chunks === 1
                  ? "1 chunk indexed."
                  : `${chunks} chunks indexed.`,
          });
        },
        onError: handleCreateError,
      },
    );
  };

  const handleDeleteAsset = (assetId: string) => {
    deleteAsset.mutate(
      { assetId },
      {
        onSuccess: () => {
          if (editing?.id) {
            queryClient.invalidateQueries({ queryKey: getListSourceAssetsQueryKey(editing.id) });
            invalidateSources();
          }
        },
        onError: handleCreateError,
      },
    );
  };

  const indexingError = sources.find((source) => {
    if (!isIndexableSourceType(source.sourceType)) return false;
    return syncStatus(source.connectionConfig) === "error" && Boolean(configString(source.connectionConfig, "lastError"));
  });
  const indexingErrorMessage = indexingError
    ? configString(indexingError.connectionConfig, "lastError")
    : "";

  const handleToggle = (source: KnowledgeSource, isEnabled: boolean) => {
    if (!canEdit) return;
    updateSource.mutate(
      { id: source.id, data: { isEnabled } },
      {
        onSuccess: invalidateSources,
        onError: handleCreateError,
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!canEdit || !sourceToDelete) return;
    deleteSource.mutate(
      { id: sourceToDelete.id },
      {
        onSuccess: () => {
          invalidateSources();
          toast({ title: "Source removed", description: `Deleted "${sourceToDelete.name}"` });
          setSourceToDelete(null);
        },
        onError: handleCreateError,
      },
    );
  };

  const addOptions = useMemo(
    () => [
      {
        kind: "article" as const,
        title: "Write an article",
        description: "Draft knowledge in place for this agent.",
        icon: FileText,
      },
      {
        kind: "document" as const,
        title: "Upload a document",
        description: "Add a Word (.docx) or Excel (.xlsx) file.",
        icon: FileUp,
      },
      {
        kind: "url" as const,
        title: "Paste a link",
        description: "Google Docs or Sheets shared with Anyone with the link can view.",
        icon: Link,
      },
    ],
    [],
  );

  const articleOpen = dialog === "article" || dialog === "edit-article";
  const documentOpen = dialog === "document";
  const urlOpen = dialog === "url";

  return (
    <div className="space-y-6">
      <MutatingControls>
      <div className="space-y-3">
        <div>
          <h2 className="font-semibold text-base tracking-tight">Add a source</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Articles, uploaded files, and public Google Docs or Sheets. After adding a source,
            select it on a rule that searches knowledge.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {addOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.kind}
                type="button"
                onClick={() => openAdd(option.kind)}
                className="rounded-lg border border-border bg-card p-4 text-left hover:border-blue-200 dark:hover:border-blue-900/50 hover:bg-accent/20 transition-colors"
              >
                <Icon className="w-4 h-4 text-primary mb-2" />
                <div className="text-sm font-medium">{option.title}</div>
                <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>
      </MutatingControls>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <h2 className="font-semibold text-base tracking-tight">Knowledge sources</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
            {sources.length}
          </span>
        </div>
        {indexingErrorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div className="min-w-0 space-y-1">
              <p>{indexingErrorMessage}</p>
              <MutatingControls>
                <button
                  type="button"
                  className="font-medium underline underline-offset-2"
                  onClick={() => handleRefreshSource(indexingError!)}
                  disabled={refreshSource.isPending}
                >
                  Retry indexing
                </button>
              </MutatingControls>
            </div>
          </div>
        ) : null}

        {sources.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            No sources yet. Write an article, upload a file, or paste a Google Doc or Sheet link.
          </p>
        ) : (
          <div className="space-y-2.5">
            {sources.map((source) => {
              const summary = (
                <>
                  <div className="w-8 h-8 rounded-md bg-muted/70 flex items-center justify-center text-muted-foreground shrink-0 border border-border/40">
                    <SourceTypeIcon type={source.sourceType} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate">{source.name}</span>
                      <Badge variant="outline" className="text-xs h-5 shrink-0">
                        {SOURCE_LABELS[source.sourceType] ?? source.sourceType}
                      </Badge>
                      {isIndexableSourceType(source.sourceType) && (
                        <Badge
                          variant="outline"
                          className={cn("text-xs h-5 shrink-0", syncBadge(source.connectionConfig).className)}
                        >
                          {syncBadge(source.connectionConfig).label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{sourceSummary(source)}</p>
                  </div>
                </>
              );

              return (
              <div
                key={source.id}
                className="group rounded-lg p-3 flex items-center justify-between border border-border/80 bg-card shadow-sm"
              >
                {canEdit ? (
                  <button
                    type="button"
                    className="flex items-center gap-3 min-w-0 text-left flex-1 pr-3"
                    onClick={() => openEdit(source)}
                  >
                    {summary}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                    {summary}
                  </div>
                )}
                <div className="flex items-center gap-3 shrink-0">
                  {canEdit ? (
                    <Switch
                      checked={source.isEnabled}
                      onCheckedChange={(checked) => handleToggle(source, checked)}
                      aria-label={source.isEnabled ? "Disable source" : "Enable source"}
                    />
                  ) : (
                    <Badge variant={source.isEnabled ? "default" : "secondary"} className="text-[10px]">
                      {source.isEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  )}
                  {canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-xs">
                      {source.sourceType === "article" && (
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openEdit(source)}>
                          Edit
                        </DropdownMenuItem>
                      )}
                      {isIndexableSourceType(source.sourceType) && (
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer"
                          onClick={() => handleRefreshSource(source)}
                          disabled={refreshSource.isPending}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          {syncStatus(source.connectionConfig) === "error" ? "Retry indexing" : "Refresh"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                        onClick={() => setSourceToDelete(source)}
                      >
                        <Trash className="w-3.5 h-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  ) : null}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={canEdit && articleOpen} onOpenChange={(open) => !open && resetDialog()}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit article" : "Write an article"}</DialogTitle>
            <DialogDescription>
              This article becomes knowledge this agent can use in its rules.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveArticle} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="article-title" className="text-xs">Title</Label>
              <Input
                id="article-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Refund policy"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="article-body" className="text-xs">Article</Label>
              <Textarea
                id="article-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the knowledge this agent should use..."
                className="min-h-48"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="article-images" className="text-xs">Screenshots</Label>
              <input
                ref={imageInputRef}
                id="article-images"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => {
                  setImageFiles((current) => [...current, ...Array.from(event.target.files ?? [])].slice(0, 40));
                  event.currentTarget.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
                <Image className="mr-2 h-3.5 w-3.5" /> Add screenshots
              </Button>
              {imageFiles.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {imageFiles.map((image, index) => (
                    <div key={`${image.name}-${index}`} className="rounded-md border border-border p-2 text-xs">
                      <LocalImagePreview file={image} />
                      <button
                        type="button"
                        className="mt-1 text-destructive hover:underline"
                        onClick={() => setImageFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {existingAssets.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {existingAssets.map((asset) => (
                    <div key={asset.id} className="rounded-md border border-border p-2 text-xs">
                      <ExistingImagePreview assetId={asset.id} alt={asset.originalName} />
                      <div className="mt-1 truncate">{asset.originalName}</div>
                      <button
                        type="button"
                        className="text-destructive hover:underline"
                        onClick={() => handleDeleteAsset(asset.id)}
                        disabled={deleteAsset.isPending}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">PNG, JPEG, or WebP up to 8 MB each. Screenshots will be searchable in chat.</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving || uploadAsset.isPending || !title.trim() || (!body.trim() && imageFiles.length === 0)}>
                {editing ? "Save changes" : "Add article"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={canEdit && documentOpen} onOpenChange={(open) => !open && resetDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a document</DialogTitle>
            <DialogDescription>
              Word (.docx) and Excel (.xlsx) files are extracted and stored as knowledge.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUploadDocument} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="document-name" className="text-xs">Name (optional)</Label>
              <Input
                id="document-name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Defaults to the file name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Document</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-border px-4 py-8 text-center hover:bg-accent/20"
              >
                <FileUp className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm font-medium">{file ? file.name : "Choose a .docx or .xlsx file"}</div>
                <p className="text-xs text-muted-foreground mt-1">Maximum 10 MB</p>
              </button>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving || !file}>
                Upload document
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={canEdit && urlOpen} onOpenChange={(open) => !open && resetDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste a link</DialogTitle>
            <DialogDescription>
              The file must be shared as Anyone with the link can view. Paste a Google Docs or
              Sheets URL. After it is indexed, select this source on a rule that searches knowledge.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFromUrl} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="source-url" className="text-xs">URL</Label>
              <Input
                id="source-url"
                type="text"
                inputMode="url"
                autoComplete="off"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://docs.google.com/document/d/…"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-url-name" className="text-xs">Name (optional)</Label>
              <Input
                id="source-url-name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Defaults to the document title"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving || !sourceUrl.trim()}>
                Add link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={canEdit && Boolean(sourceToDelete)} onOpenChange={(open) => !open && setSourceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete source</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">"{sourceToDelete?.name}"</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
