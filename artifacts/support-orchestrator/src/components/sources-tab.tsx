import { useEffect, useMemo, useRef, useState } from "react";
import {
  useListSources,
  useCreateSource,
  useUpdateSource,
  useDeleteSource,
  useListSourceIntegrations,
  useUploadSourceDocument,
  getListSourcesQueryKey,
  getListSourceIntegrationsQueryKey,
  type KnowledgeSource,
  type SourceIntegration,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ExternalLink,
  FileText,
  FileUp,
  Link2,
  MoreVertical,
  Plug,
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

const REPLIT_INTEGRATIONS_URL =
  "https://replit.com/~?settings.show=true&settings.tab=integrations";

type SourceKind = "article" | "document" | "spreadsheet" | "notion" | "confluence";
type DialogKind = SourceKind | "edit-article" | null;

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

function sourceSummary(source: KnowledgeSource) {
  const config = source.connectionConfig;
  if (source.sourceType === "article") {
    const body = configString(config, "body");
    return body || "Written article";
  }
  if (source.sourceType === "document") {
    return configString(config, "fileName") || "Word document";
  }
  if (source.sourceType === "spreadsheet") {
    return configString(config, "url") || "Spreadsheet link";
  }
  if (source.sourceType === "notion" || source.sourceType === "confluence") {
    return "Linked with Replit Integrations";
  }
  return source.sourceType;
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
  const createSource = useCreateSource();
  const updateSource = useUpdateSource();
  const deleteSource = useDeleteSource();
  const uploadDocument = useUploadSourceDocument();

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

  const openAdd = (kind: SourceKind) => {
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

  const handleLinkIntegration = (connectorName: "notion" | "confluence") => {
    const integration = integrationFor(integrations, connectorName);
    if (!integration?.connected) {
      toast({
        title: `Connect ${integration?.displayName ?? connectorName} first`,
        description: "Open Replit Integrations, sign in, then come back here.",
        variant: "destructive",
      });
      return;
    }

    const alreadyLinked = sources.some((source) => source.sourceType === connectorName);
    if (alreadyLinked) {
      toast({ title: `${integration.displayName} is already linked to this agent` });
      resetDialog();
      return;
    }

    createSource.mutate(
      {
        data: {
          agentId,
          name: integration.displayName,
          sourceType: connectorName,
          connectionConfig: {
            connectorName,
            connectionId: integration.connectionId,
          },
        },
      },
      {
        onSuccess: () => {
          invalidateSources();
          toast({ title: `${integration.displayName} linked` });
          resetDialog();
        },
        onError: handleCreateError,
      },
    );
  };

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
        kind: "document" as const,
        title: "Upload a document",
        description: "Add a Word (.docx) file.",
        icon: FileUp,
      },
      {
        kind: "spreadsheet" as const,
        title: "Paste a spreadsheet link",
        description: "Point at Google Sheets or Excel Online.",
        icon: Table2,
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
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
                        "text-[9px] uppercase font-mono tracking-wider h-5",
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

        {sources.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            No sources yet. Write an article, upload a document, paste a spreadsheet link, or connect Notion or Confluence.
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
                      <Badge variant="outline" className="text-[9px] uppercase font-mono tracking-wider h-5 shrink-0">
                        {SOURCE_LABELS[source.sourceType] ?? source.sourceType}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{sourceSummary(source)}</p>
                  </div>
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={cn(
                      "text-[11px] font-semibold tracking-wider uppercase",
                      source.isEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60",
                    )}
                  >
                    {source.isEnabled ? "ON" : "OFF"}
                  </span>
                  <Switch
                    checked={source.isEnabled}
                    onCheckedChange={(checked) => handleToggle(source, checked)}
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
                      {(source.sourceType === "article" || source.sourceType === "spreadsheet") && (
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openEdit(source)}>
                          Edit
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
        saving={saving}
        onOpenChange={(open) => !open && resetDialog()}
        onRefresh={() => refetchIntegrations()}
        onLink={() => handleLinkIntegration("notion")}
      />
      <IntegrationDialog
        open={confluenceOpen}
        connectorName="confluence"
        integration={integrationFor(integrations, "confluence")}
        saving={saving}
        onOpenChange={(open) => !open && resetDialog()}
        onRefresh={() => refetchIntegrations()}
        onLink={() => handleLinkIntegration("confluence")}
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
  saving,
  onOpenChange,
  onRefresh,
  onLink,
}: {
  open: boolean;
  connectorName: "notion" | "confluence";
  integration?: SourceIntegration;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  onLink: () => void;
}) {
  const name = integration?.displayName ?? (connectorName === "notion" ? "Notion" : "Confluence");
  const connected = Boolean(integration?.connected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link {name}</DialogTitle>
          <DialogDescription>
            Native access uses Replit Integrations. Connect once in Replit, then attach it to this agent.
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
                "text-[9px] uppercase font-mono tracking-wider h-5",
                connected ? "text-emerald-500" : "text-muted-foreground",
              )}
            >
              {connected ? "Connected" : "Not linked"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {connected
              ? `${name} is connected in Replit Integrations. Add it as a knowledge source for this agent.`
              : `Open Replit Integrations, sign in to ${name}, then refresh this dialog.`}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" asChild>
            <a href={REPLIT_INTEGRATIONS_URL} target="_blank" rel="noreferrer">
              Open Integrations
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </a>
          </Button>
          {connected ? (
            <Button type="button" onClick={onLink} disabled={saving}>
              Add {name}
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
