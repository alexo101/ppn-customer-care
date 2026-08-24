import { useEffect, useMemo, useRef, useState } from "react";
import {
  useListSources,
  useCreateSource,
  useUpdateSource,
  useDeleteSource,
  useListSourceIntegrations,
  useListTeamConnections,
  useUploadSourceDocument,
  useRefreshSource,
  browseSourceIntegration,
  getListSourcesQueryKey,
  getListSourceIntegrationsQueryKey,
  getListTeamConnectionsQueryKey,
  type KnowledgeSource,
  type SourceBrowseItem,
  type SourceIntegration,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  ExternalLink,
  FileText,
  FileUp,
  Link2,
  Loader2,
  MoreVertical,
  Plug,
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { useTenantContext } from "@/components/tenant-context";

const REPLIT_INTEGRATIONS_URL =
  "https://replit.com/~?settings.show=true&settings.tab=integrations";

type SourceKind = "article" | "document" | "spreadsheet" | "notion" | "confluence";
type AddKind = SourceKind | "document-or-spreadsheet";
type DialogKind = AddKind | "edit-article" | null;

const SOURCE_LABELS: Record<string, string> = {
  article: "Article",
  document: "Document",
  spreadsheet: "Spreadsheet",
  notion: "Notion",
  confluence: "Confluence",
};

function configString(config: Record<string, unknown> | undefined, key: string) {
  const value = config?.[key];
  return typeof value === "string" ? value : "";
}

function configValue(config: Record<string, unknown> | undefined, key: string): unknown {
  return config?.[key];
}

function selectedKnowledgeItems(config: Record<string, unknown> | undefined): SourceBrowseItem[] {
  const raw = configValue(config, "selectedItems");
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : "";
    const type = item.type === "page" || item.type === "database" || item.type === "space" ? item.type : null;
    const title = typeof item.title === "string" ? item.title : id;
    if (!id || !type) return [];
    return [{ id, type, title, parentTitle: typeof item.parentTitle === "string" ? item.parentTitle : undefined }];
  });
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
  return sourceType === "article" || sourceType === "document" || sourceType === "notion" || sourceType === "confluence";
}

function chunkCount(config: Record<string, unknown> | undefined) {
  const value = configValue(config, "chunkCount");
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sourceScope(source: KnowledgeSource) {
  const config = source.connectionConfig;
  if (source.sourceType === "article") {
    return configString(config, "body") || "Written article";
  }
  if (source.sourceType === "document") {
    return configString(config, "fileName") || "Word document";
  }
  if (source.sourceType === "spreadsheet") {
    return configString(config, "url") || "Spreadsheet link";
  }
  if (source.sourceType === "notion" || source.sourceType === "confluence") {
    const items = selectedKnowledgeItems(config);
    const titles = items.map((item) => item.title);
    if (titles.length === 0) return "No content selected";
    if (titles.length <= 2) return titles.join(", ");
    return `${titles.slice(0, 2).join(", ")} +${titles.length - 2} more`;
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
  if (status === "ready") {
    return chunks === 1 ? `${scope} · 1 chunk indexed` : `${scope} · ${chunks} chunks indexed`;
  }
  if (status === "empty") return `${scope} · No indexable text`;
  if (status === "syncing") return `${scope} · Indexing…`;
  return `${scope} · Waiting to index`;
}

function SourceTypeIcon({ type, className }: { type: string; className?: string }) {
  const props = { className: cn("w-4 h-4", className) };
  if (type === "document") return <FileUp {...props} />;
  if (type === "spreadsheet") return <Table2 {...props} />;
  if (type === "notion") return <BookOpen {...props} />;
  if (type === "confluence") return <Plug {...props} />;
  return <FileText {...props} />;
}

function integrationFor(
  integrations: SourceIntegration[],
  connectorName: "notion" | "confluence",
) {
  return integrations.find((item) => item.connectorName === connectorName);
}

export function SourcesTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const { data: sources = [] } = useListSources({ agentId });
  const { data: integrations = [], refetch: refetchIntegrations } = useListSourceIntegrations();
  const { teamId } = useTenantContext();
  const { data: teamConnections = [] } = useListTeamConnections(teamId ?? "", {
    query: { enabled: Boolean(teamId), queryKey: getListTeamConnectionsQueryKey(teamId ?? "") },
  });
  const createSource = useCreateSource();
  const updateSource = useUpdateSource();
  const deleteSource = useDeleteSource();
  const uploadDocument = useUploadSourceDocument();
  const refreshSource = useRefreshSource();

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [editing, setEditing] = useState<KnowledgeSource | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<KnowledgeSource | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saving =
    createSource.isPending ||
    updateSource.isPending ||
    uploadDocument.isPending;

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

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: getListSourceIntegrationsQueryKey() });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient]);

  const resetDialog = () => {
    setDialog(null);
    setEditing(null);
    setTitle("");
    setBody("");
    setUrl("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openAdd = (kind: AddKind) => {
    setEditing(null);
    setTitle("");
    setBody("");
    setUrl("");
    setFile(null);
    setDialog(kind);
  };

  const openEdit = (source: KnowledgeSource) => {
    if (source.sourceType === "article") {
      setEditing(source);
      setTitle(source.name);
      setBody(configString(source.connectionConfig, "body"));
      setDialog("edit-article");
      return;
    }
    if (source.sourceType === "spreadsheet") {
      setEditing(source);
      setTitle(source.name);
      setUrl(configString(source.connectionConfig, "url"));
      setDialog("spreadsheet");
      return;
    }
    if (source.sourceType === "notion" || source.sourceType === "confluence") {
      setEditing(source);
      setTitle(source.name);
      setDialog(source.sourceType);
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
    const name = title.trim();
    const content = body.trim();
    if (!name || !content) return;

    const onSuccess = () => {
      invalidateSources();
      toast({ title: editing ? "Article updated" : "Article added" });
      resetDialog();
    };

    if (editing) {
      updateSource.mutate(
        { id: editing.id, data: { name, connectionConfig: { body: content } } },
        { onSuccess, onError: handleCreateError },
      );
      return;
    }

    createSource.mutate(
      { data: { agentId, name, sourceType: "article", connectionConfig: { body: content } } },
      { onSuccess, onError: handleCreateError },
    );
  };

  const handleSaveSpreadsheet = (event: React.FormEvent) => {
    event.preventDefault();
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      toast({ title: "Enter a valid spreadsheet URL", variant: "destructive" });
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      toast({ title: "Enter a valid spreadsheet URL", variant: "destructive" });
      return;
    }

    const name = title.trim() || parsed.hostname.replace(/^www\./, "") || "Spreadsheet";
    const onSuccess = () => {
      invalidateSources();
      toast({ title: editing ? "Spreadsheet updated" : "Spreadsheet added" });
      resetDialog();
    };

    if (editing) {
      updateSource.mutate(
        { id: editing.id, data: { name, connectionConfig: { url: parsed.toString() } } },
        { onSuccess, onError: handleCreateError },
      );
      return;
    }

    createSource.mutate(
      {
        data: {
          agentId,
          name,
          sourceType: "spreadsheet",
          connectionConfig: { url: parsed.toString() },
        },
      },
      { onSuccess, onError: handleCreateError },
    );
  };

  const handleUploadDocument = (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      toast({ title: "Choose a .docx file", variant: "destructive" });
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

  const handleLinkIntegration = (
    connectorName: "notion" | "confluence",
    selectedItems: SourceBrowseItem[],
  ) => {
    const integration = integrationFor(integrations, connectorName);
    const managedConnection = teamConnections.find((connection) => connection.provider === connectorName);
    if (!integration?.connected && !managedConnection) {
      toast({
        title: `Connect ${integration?.displayName ?? connectorName} first`,
        description: "Open Replit Integrations, sign in, then come back here.",
        variant: "destructive",
      });
      return;
    }
    if (selectedItems.length === 0) {
      toast({ title: "Select at least one item", variant: "destructive" });
      return;
    }

    const name =
      title.trim() ||
      (selectedItems.length === 1
        ? selectedItems[0].title
        : `${managedConnection?.provider ?? integration?.displayName ?? connectorName} (${selectedItems.length})`);
    const connectionConfig = {
      connectorName,
      connectionId: integration?.connectionId,
      ...(managedConnection ? { organizationConnectionId: managedConnection.id } : {}),
      selectedItems,
    };
    const onSuccess = () => {
      invalidateSources();
      toast({ title: editing ? `${managedConnection?.provider ?? integration?.displayName ?? connectorName} updated` : `${managedConnection?.provider ?? integration?.displayName ?? connectorName} linked` });
      resetDialog();
    };

    if (editing) {
      updateSource.mutate(
        { id: editing.id, data: { name, connectionConfig } },
        { onSuccess, onError: handleCreateError },
      );
      return;
    }

    createSource.mutate(
      {
        data: {
          agentId,
          name,
          sourceType: connectorName,
          connectionConfig,
        },
      },
      { onSuccess, onError: handleCreateError },
    );
  };

  const handleRefreshSource = (source: KnowledgeSource) => {
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

  const indexingError = sources.find((source) => {
    if (!isIndexableSourceType(source.sourceType)) return false;
    return syncStatus(source.connectionConfig) === "error" && Boolean(configString(source.connectionConfig, "lastError"));
  });
  const indexingErrorMessage = indexingError
    ? configString(indexingError.connectionConfig, "lastError")
    : "";

  const handleToggle = (source: KnowledgeSource, isEnabled: boolean) => {
    updateSource.mutate(
      { id: source.id, data: { isEnabled } },
      {
        onSuccess: invalidateSources,
        onError: handleCreateError,
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!sourceToDelete) return;
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
        kind: "document-or-spreadsheet" as const,
        title: "Add a file or spreadsheet",
        description: "Upload a Word document or paste a spreadsheet link.",
        icon: FileUp,
      },
      {
        kind: "notion" as const,
        title: "Link Notion",
        description: "Connect natively with Replit Integrations.",
        icon: BookOpen,
      },
      {
        kind: "confluence" as const,
        title: "Link Confluence",
        description: "Connect natively with Replit Integrations.",
        icon: Plug,
      },
    ],
    [],
  );

  const articleOpen = dialog === "article" || dialog === "edit-article";
  const chooserOpen = dialog === "document-or-spreadsheet";
  const documentOpen = dialog === "document";
  const spreadsheetOpen = dialog === "spreadsheet";
  const notionOpen = dialog === "notion";
  const confluenceOpen = dialog === "confluence";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h2 className="font-semibold text-base tracking-tight">Add a source</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Articles, documents, spreadsheets, and Replit Integrations this agent can use.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {addOptions.map((option) => {
            const Icon = option.icon;
            const integration =
              option.kind === "notion" || option.kind === "confluence"
                ? integrationFor(integrations, option.kind)
                : undefined;
            return (
              <button
                key={option.kind}
                type="button"
                onClick={() => openAdd(option.kind)}
                className="rounded-lg border border-border bg-card p-4 text-left hover:border-blue-200 dark:hover:border-blue-900/50 hover:bg-accent/20 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Icon className="w-4 h-4 text-primary" />
                  {integration ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs h-5",
                        integration.connected ? "text-emerald-500" : "text-muted-foreground",
                      )}
                    >
                      {integration.connected ? "Connected" : "Not linked"}
                    </Badge>
                  ) : null}
                </div>
                <div className="text-sm font-medium">{option.title}</div>
                <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>

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
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => handleRefreshSource(indexingError!)}
                disabled={refreshSource.isPending}
              >
                Retry indexing
              </button>
            </div>
          </div>
        ) : null}

        {sources.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            No sources yet. Write an article, add a file or spreadsheet, or connect Notion or Confluence.
          </p>
        ) : (
          <div className="space-y-2.5">
            {sources.map((source) => (
              <div
                key={source.id}
                className="group rounded-lg p-3 flex items-center justify-between border border-border/80 bg-card shadow-sm"
              >
                <button
                  type="button"
                  className="flex items-center gap-3 min-w-0 text-left flex-1 pr-3"
                  onClick={() => openEdit(source)}
                >
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
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    checked={source.isEnabled}
                    onCheckedChange={(checked) => handleToggle(source, checked)}
                    aria-label={source.isEnabled ? "Disable source" : "Enable source"}
                  />
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
                      {(source.sourceType === "article" || source.sourceType === "spreadsheet" || source.sourceType === "notion" || source.sourceType === "confluence") && (
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={articleOpen} onOpenChange={(open) => !open && resetDialog()}>
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
            <DialogFooter>
              <Button type="submit" disabled={saving || !title.trim() || !body.trim()}>
                {editing ? "Save changes" : "Add article"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={chooserOpen}
        onOpenChange={(open) => {
          if (!open && dialog === "document-or-spreadsheet") resetDialog();
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add a file or spreadsheet</DialogTitle>
            <DialogDescription>How would you like to add it?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => openAdd("document")}
              className="rounded-lg border border-border bg-card p-4 text-left hover:border-blue-200 dark:hover:border-blue-900/50 hover:bg-accent/20 transition-colors"
            >
              <FileUp className="w-4 h-4 text-primary mb-2" />
              <div className="text-sm font-medium">Upload a Word document</div>
              <p className="text-xs text-muted-foreground mt-1">Accepts .docx</p>
            </button>
            <button
              type="button"
              onClick={() => openAdd("spreadsheet")}
              className="rounded-lg border border-border bg-card p-4 text-left hover:border-blue-200 dark:hover:border-blue-900/50 hover:bg-accent/20 transition-colors"
            >
              <Table2 className="w-4 h-4 text-primary mb-2" />
              <div className="text-sm font-medium">Paste a spreadsheet link</div>
              <p className="text-xs text-muted-foreground mt-1">
                Supports Google Sheets, Excel Online, or another published spreadsheet URL
              </p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={documentOpen} onOpenChange={(open) => !open && resetDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a document</DialogTitle>
            <DialogDescription>Word documents (.docx) are extracted and stored as knowledge.</DialogDescription>
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
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-border px-4 py-8 text-center hover:bg-accent/20"
              >
                <FileUp className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm font-medium">{file ? file.name : "Choose a .docx file"}</div>
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

      <Dialog open={spreadsheetOpen} onOpenChange={(open) => !open && resetDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit spreadsheet" : "Paste a spreadsheet link"}</DialogTitle>
            <DialogDescription>
              Add a Google Sheets, Excel Online, or other published spreadsheet URL.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSpreadsheet} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="sheet-name" className="text-xs">Name (optional)</Label>
              <Input
                id="sheet-name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Pricing table"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-url" className="text-xs">Spreadsheet URL</Label>
              <Input
                id="sheet-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/..."
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving || !url.trim()}>
                {editing ? "Save changes" : "Add spreadsheet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <IntegrationDialog
        open={notionOpen}
        connectorName="notion"
        integration={integrationFor(integrations, "notion")}
        managedConnectionId={teamConnections.find((connection) => connection.provider === "notion")?.id}
        saving={saving}
        selectedItems={editing?.sourceType === "notion" ? selectedKnowledgeItems(editing.connectionConfig) : []}
        sourceName={title}
        onNameChange={setTitle}
        onOpenChange={(open) => !open && resetDialog()}
        onRefresh={() => refetchIntegrations()}
        onLink={(items) => handleLinkIntegration("notion", items)}
      />
      <IntegrationDialog
        open={confluenceOpen}
        connectorName="confluence"
        integration={integrationFor(integrations, "confluence")}
        managedConnectionId={teamConnections.find((connection) => connection.provider === "confluence")?.id}
        saving={saving}
        selectedItems={editing?.sourceType === "confluence" ? selectedKnowledgeItems(editing.connectionConfig) : []}
        sourceName={title}
        onNameChange={setTitle}
        onOpenChange={(open) => !open && resetDialog()}
        onRefresh={() => refetchIntegrations()}
        onLink={(items) => handleLinkIntegration("confluence", items)}
      />

      <AlertDialog
        open={Boolean(sourceToDelete)}
        onOpenChange={(open) => !open && setSourceToDelete(null)}
      >
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

function IntegrationDialog({
  open,
  connectorName,
  integration,
  managedConnectionId,
  saving,
  selectedItems,
  sourceName,
  onNameChange,
  onOpenChange,
  onRefresh,
  onLink,
}: {
  open: boolean;
  connectorName: "notion" | "confluence";
  integration?: SourceIntegration;
  managedConnectionId?: string;
  saving: boolean;
  selectedItems: SourceBrowseItem[];
  sourceName: string;
  onNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  onLink: (items: SourceBrowseItem[]) => void;
}) {
  const name = integration?.displayName ?? (connectorName === "notion" ? "Notion" : "Confluence");
  const connected = Boolean(integration?.connected || managedConnectionId);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<SourceBrowseItem[]>([]);
  const [selected, setSelected] = useState<SourceBrowseItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [space, setSpace] = useState<{ id: string; title: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setSelected(selectedItems);
    setSearch("");
    setDebouncedSearch("");
    setSpace(null);
    setItems([]);
    setCursor(null);
    setError(null);
  }, [open, connectorName]);

  useEffect(() => {
    if (!open || !connected) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await browseSourceIntegration({
          connectorName,
          organizationConnectionId: managedConnectionId,
          teamId: localStorage.getItem("orchestrator.teamId") ?? undefined,
          query: debouncedSearch || undefined,
          spaceId: space?.id,
        });
        if (cancelled) return;
        setItems(result.items);
        setCursor(result.nextCursor ?? null);
      } catch (err) {
        if (cancelled) return;
        setItems([]);
        setCursor(null);
        setError(err instanceof Error ? err.message.replace(/^HTTP \d+\s[^:]+:\s*/, "") : "Could not load content.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, connected, connectorName, debouncedSearch, space?.id]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await browseSourceIntegration({
        connectorName,
        organizationConnectionId: managedConnectionId,
        teamId: localStorage.getItem("orchestrator.teamId") ?? undefined,
        query: debouncedSearch || undefined,
        cursor,
        spaceId: space?.id,
      });
      setItems((current) => uniqueBrowseItems([...current, ...result.items]));
      setCursor(result.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^HTTP \d+\s[^:]+:\s*/, "") : "Could not load more content.");
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleItem = (item: SourceBrowseItem, checked: boolean) => {
    setSelected((current) => {
      if (checked) return uniqueBrowseItems([...current, item]);
      return current.filter((entry) => !(entry.id === item.id && entry.type === item.type));
    });
  };

  const isSelected = (item: SourceBrowseItem) =>
    selected.some((entry) => entry.id === item.id && entry.type === item.type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{selectedItems.length > 0 ? `Edit ${name} source` : `Link ${name}`}</DialogTitle>
          <DialogDescription>
            Native access uses Replit Integrations. Choose the {name} content this agent can search.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{name}</span>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-xs h-5",
                connected ? "text-emerald-500" : "text-muted-foreground",
              )}
            >
              {connected ? "Connected" : "Not linked"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {connected
              ? `Select ${connectorName === "notion" ? "pages or databases" : "spaces or pages"} to index. Credentials stay in Replit Integrations.`
              : `Open Replit Integrations, sign in to ${name}, then refresh this dialog.`}
          </p>
        </div>

        {connected ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`${connectorName}-source-name`} className="text-xs">Name (optional)</Label>
              <Input
                id={`${connectorName}-source-name`}
                value={sourceName}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder={name}
              />
            </div>
            {space ? (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSpace(null)}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to spaces
                <span className="font-medium text-foreground">· {space.title}</span>
              </button>
            ) : null}
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={connectorName === "notion" ? "Search pages and databases" : space ? "Filter pages" : "Filter spaces"}
            />
            {error ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
            <ScrollArea className="h-56 rounded-md border border-border">
              {loading ? (
                <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading {name} content…
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-56 items-center justify-center px-6 text-center text-xs text-muted-foreground">
                  {error
                    ? "Nothing could be loaded from this account."
                    : `No ${space ? "pages" : connectorName === "notion" ? "pages or databases" : "spaces"} found.`}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {items.map((item) => (
                    <div key={`${item.type}:${item.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
                      <Checkbox
                        checked={isSelected(item)}
                        onCheckedChange={(checked) => toggleItem(item, checked === true)}
                        aria-label={`Select ${item.title}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{item.title}</div>
                        <div className="text-[11px] text-muted-foreground capitalize">
                          {item.type}
                          {item.parentTitle ? ` · ${item.parentTitle}` : ""}
                        </div>
                      </div>
                      {item.type === "space" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => setSpace({ id: item.id, title: item.title })}
                        >
                          Browse pages
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {cursor ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Load more"}
                    </Button>
                  ) : null}
                </div>
              )}
            </ScrollArea>
            <p className="text-[11px] text-muted-foreground">{selected.length} selected</p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" asChild>
            <a href={REPLIT_INTEGRATIONS_URL} target="_blank" rel="noreferrer">
              Open Integrations
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </a>
          </Button>
          {connected ? (
            <Button type="button" onClick={() => onLink(selected)} disabled={saving || selected.length === 0}>
              {selectedItems.length > 0 ? "Save selection" : `Add ${name}`}
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={onRefresh}>
              Check connection
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function uniqueBrowseItems(items: SourceBrowseItem[]): SourceBrowseItem[] {
  const seen = new Set<string>();
  const unique: SourceBrowseItem[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}
