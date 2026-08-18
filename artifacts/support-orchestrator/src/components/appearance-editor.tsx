import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetAgent,
  useGetAgentAppearance,
  useImportAgentAppearance,
  useUpdateAgent,
  useUpdateAgentAppearance,
  getGetAgentAppearanceQueryKey,
  getGetAgentQueryKey,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Loader2,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChatAppearancePreview } from "@/components/chat/chat-appearance-preview";
import { toast } from "@/hooks/use-toast";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_CTA_COLOR,
  isHexColor,
  normalizeHexColor,
} from "@/lib/appearance-theme";
import { cn } from "@/lib/utils";

const MAX_LOGO_BYTES = 400_000;

type Draft = {
  websiteUrl: string;
  ctaColor: string;
  backgroundColor: string;
  logoUrl: string;
};

function FieldBlock({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-3">
      <div className="pb-3 border-b border-border">
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function AppearanceEditor({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const { data: agent } = useGetAgent(agentId);
  const { data, isLoading } = useGetAgentAppearance(agentId);
  const updateAppearance = useUpdateAgentAppearance();
  const updateAgent = useUpdateAgent();
  const importAppearance = useImportAgentAppearance();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<Draft>({
    websiteUrl: "",
    ctaColor: DEFAULT_CTA_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    logoUrl: "",
  });
  const [ctaCandidates, setCtaCandidates] = useState<string[]>([]);
  const [backgroundCandidates, setBackgroundCandidates] = useState<string[]>([]);
  const [logoCandidates, setLogoCandidates] = useState<string[]>([]);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [ctaHexInput, setCtaHexInput] = useState(DEFAULT_CTA_COLOR);
  const [bgHexInput, setBgHexInput] = useState(DEFAULT_BACKGROUND_COLOR);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const lastSyncedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setDescription(agent.description);
  }, [agent]);

  useEffect(() => {
    if (!data) return;
    if (lastSyncedAt.current === data.updatedAt) return;
    lastSyncedAt.current = data.updatedAt;
    setDraft({
      websiteUrl: data.websiteUrl ?? "",
      ctaColor: data.ctaColor,
      backgroundColor: data.backgroundColor,
      logoUrl: data.logoUrl ?? "",
    });
    setCtaHexInput(data.ctaColor);
    setBgHexInput(data.backgroundColor);
  }, [data]);

  const savedSnapshot = useMemo(
    () =>
      JSON.stringify({
        name: agent?.name ?? "",
        description: agent?.description ?? "",
        websiteUrl: data?.websiteUrl ?? "",
        ctaColor: data?.ctaColor ?? DEFAULT_CTA_COLOR,
        backgroundColor: data?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
        logoUrl: data?.logoUrl ?? "",
      }),
    [agent, data],
  );

  const currentSnapshot = JSON.stringify({
    name,
    description,
    websiteUrl: draft.websiteUrl,
    ctaColor: draft.ctaColor,
    backgroundColor: draft.backgroundColor,
    logoUrl: draft.logoUrl,
  });
  const isDirty = currentSnapshot !== savedSnapshot;
  const saving = updateAppearance.isPending || updateAgent.isPending;

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.websiteUrl.trim() || importAppearance.isPending) return;

    importAppearance.mutate(
      { id: agentId, data: { url: draft.websiteUrl.trim() } },
      {
        onSuccess: (result) => {
          const next = result.appearance;
          setDraft({
            websiteUrl: next.websiteUrl ?? draft.websiteUrl,
            ctaColor: next.ctaColor,
            backgroundColor: next.backgroundColor,
            logoUrl: next.logoUrl ?? "",
          });
          setCtaHexInput(next.ctaColor);
          setBgHexInput(next.backgroundColor);
          setCtaCandidates(result.ctaColorCandidates ?? []);
          setBackgroundCandidates(result.backgroundColorCandidates ?? []);
          setLogoCandidates(result.logoCandidates ?? []);
          setPageTitle(result.pageTitle ?? null);
          queryClient.invalidateQueries({ queryKey: getGetAgentAppearanceQueryKey(agentId) });
          toast({
            title: "Main styling imported",
            description: result.pageTitle
              ? `Detected colors and logo from ${result.pageTitle}. You can adjust them below.`
              : "Detected CTA color, background color, and logo. You can adjust them below.",
          });
        },
        onError: (error) => {
          toast({
            title: "Could not import styling",
            description: error instanceof Error ? error.message : "Check the URL and try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleSave = async () => {
    const ctaColor = normalizeHexColor(draft.ctaColor);
    const backgroundColor = normalizeHexColor(draft.backgroundColor);
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!ctaColor || !backgroundColor) {
      toast({
        title: "Invalid colors",
        description: "CTA and background colors must be hex values like #0EA5E9.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateAgent.mutateAsync({
        id: agentId,
        data: { name: name.trim(), description },
      });
      await updateAppearance.mutateAsync({
        id: agentId,
        data: {
          websiteUrl: draft.websiteUrl.trim() || null,
          ctaColor,
          backgroundColor,
          logoUrl: draft.logoUrl.trim() || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAgentQueryKey(agentId) });
      queryClient.invalidateQueries({ queryKey: getGetAgentAppearanceQueryKey(agentId) });
      toast({
        title: "Appearance saved",
        description: "Name, description, colors, and logo are up to date.",
      });
    } catch (error) {
      toast({
        title: "Could not save appearance",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Choose an image file", variant: "destructive" });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast({
        title: "Logo is too large",
        description: "Use an image under 400 KB, or paste an image URL instead.",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setDraft((prev) => ({ ...prev, logoUrl: result }));
    };
    reader.readAsDataURL(file);
  };

  const setCtaColor = (value: string) => {
    const hex = normalizeHexColor(value);
    if (!hex) return;
    setDraft((prev) => ({ ...prev, ctaColor: hex }));
    setCtaHexInput(hex);
  };

  const setBackgroundColor = (value: string) => {
    const hex = normalizeHexColor(value);
    if (!hex) return;
    setDraft((prev) => ({ ...prev, backgroundColor: hex }));
    setBgHexInput(hex);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleSave}
          disabled={!isDirty || saving || isLoading}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1" />
          )}
          Save appearance
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="space-y-3">
          <FieldBlock title="Name" description="Display name for this agent.">
            <Label htmlFor={`agent-name-${agentId}`} className="sr-only">Name</Label>
            <Input
              id={`agent-name-${agentId}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Billing support"
            />
          </FieldBlock>

          <FieldBlock title="Description" description="What this agent handles.">
            <Label htmlFor={`agent-description-${agentId}`} className="sr-only">Description</Label>
            <Textarea
              id={`agent-description-${agentId}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of this agent"
              className="min-h-[80px]"
            />
          </FieldBlock>

          <FieldBlock
            title="Website URL"
            description="Import CTA color, background color, and logo from a homepage."
          >
            <form onSubmit={handleImport} className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  type="text"
                  inputMode="url"
                  placeholder="https://www.your-website.com"
                  value={draft.websiteUrl}
                  onChange={(e) => setDraft((prev) => ({ ...prev, websiteUrl: e.target.value }))}
                  className="h-9 text-sm bg-background"
                />
              </div>
              <Button type="submit" className="h-9 text-xs shrink-0" disabled={importAppearance.isPending || !draft.websiteUrl.trim()}>
                {importAppearance.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                )}
                Import styling
              </Button>
            </form>
            {pageTitle ? (
              <p className="text-[11px] text-muted-foreground">Detected from: {pageTitle}</p>
            ) : null}
          </FieldBlock>

          <FieldBlock title="CTA color" description="Buttons, header, and user chat bubbles.">
            <ColorField
              label="CTA color"
              value={draft.ctaColor}
              hexInput={ctaHexInput}
              onHexInputChange={setCtaHexInput}
              onCommit={setCtaColor}
              candidates={ctaCandidates}
            />
          </FieldBlock>

          <FieldBlock title="Background color" description="Chat panel background.">
            <ColorField
              label="Background color"
              value={draft.backgroundColor}
              hexInput={bgHexInput}
              onHexInputChange={setBgHexInput}
              onCommit={setBackgroundColor}
              candidates={backgroundCandidates}
            />
          </FieldBlock>

          <FieldBlock title="Logo" description="You can change this logo anytime.">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-lg border border-border bg-card flex items-center justify-center overflow-hidden shrink-0">
                {draft.logoUrl ? (
                  <img src={draft.logoUrl} alt="Current logo" className="h-full w-full object-contain p-1" />
                ) : (
                  <span className="text-[10px] text-muted-foreground text-center px-1">No logo</span>
                )}
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => logoFileRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    Upload logo
                  </Button>
                  {draft.logoUrl && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDraft((prev) => ({ ...prev, logoUrl: "" }))}>
                      Remove
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="Or paste a logo image URL"
                  value={draft.logoUrl.startsWith("data:") ? "" : draft.logoUrl}
                  onChange={(e) => setDraft((prev) => ({ ...prev, logoUrl: e.target.value }))}
                  className="h-8 text-xs bg-background"
                />
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    handleLogoFile(e.target.files?.[0]);
                    e.currentTarget.value = "";
                  }}
                />
              </div>
            </div>
            {logoCandidates.length > 1 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-[11px] text-muted-foreground">Other logos found on the page</p>
                <div className="flex flex-wrap gap-2">
                  {logoCandidates.map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, logoUrl: src }))}
                      className={cn(
                        "h-12 w-12 rounded-md border bg-background overflow-hidden",
                        draft.logoUrl === src ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30",
                      )}
                    >
                      <img src={src} alt="" className="h-full w-full object-contain p-1" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </FieldBlock>
        </div>

        <ChatAppearancePreview
          ctaColor={isHexColor(draft.ctaColor) ? draft.ctaColor : DEFAULT_CTA_COLOR}
          backgroundColor={isHexColor(draft.backgroundColor) ? draft.backgroundColor : DEFAULT_BACKGROUND_COLOR}
          logoUrl={draft.logoUrl || null}
          className="rounded-xl border border-border shadow-sm overflow-hidden"
        />
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  hexInput,
  onHexInputChange,
  onCommit,
  candidates,
}: {
  label: string;
  value: string;
  hexInput: string;
  onHexInputChange: (value: string) => void;
  onCommit: (value: string) => void;
  candidates: string[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHexColor(value) ? value : "#000000"}
          onChange={(e) => onCommit(e.target.value)}
          className="h-9 w-12 rounded-md border border-input bg-background cursor-pointer p-0.5"
          aria-label={label}
        />
        <Input
          value={hexInput}
          onChange={(e) => {
            const next = e.target.value;
            onHexInputChange(next);
            if (isHexColor(next)) onCommit(next);
          }}
          className="h-9 font-mono text-xs uppercase"
          maxLength={7}
        />
      </div>
      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={() => onCommit(hex)}
              className={cn(
                "h-6 w-6 rounded-full border",
                value.toUpperCase() === hex.toUpperCase() ? "border-foreground ring-2 ring-ring" : "border-border",
              )}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
