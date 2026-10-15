import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetAgent,
  useGetAgentAppearance,
  useUpdateAgent,
  useUpdateAgentAppearance,
  getGetAgentAppearanceQueryKey,
  getGetAgentQueryKey,
  getGetAgentEscalationQueryKey,
  getListAgentsQueryKey,
  getListInboxTeamsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Save,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatAppearancePreview } from "@/components/chat/chat-appearance-preview";
import { toast } from "@/hooks/use-toast";
import { MutatingControls, useWorkspaceAccess } from "@/components/workspace-access";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_CTA_COLOR,
  isHexColor,
  normalizeHexColor,
} from "@/lib/appearance-theme";

const MAX_LOGO_BYTES = 400_000;

type Draft = {
  ctaColor: string;
  backgroundColor: string;
  logoUrl: string;
};

function FieldBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

export function AppearanceEditor({ agentId }: { agentId: string }) {
  const { canEdit } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const { data: agent } = useGetAgent(agentId);
  const { data, isLoading } = useGetAgentAppearance(agentId);
  const updateAppearance = useUpdateAgentAppearance();
  const updateAgent = useUpdateAgent();

  const [name, setName] = useState("");
  const [draft, setDraft] = useState<Draft>({
    ctaColor: DEFAULT_CTA_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    logoUrl: "",
  });
  const [ctaHexInput, setCtaHexInput] = useState(DEFAULT_CTA_COLOR);
  const [bgHexInput, setBgHexInput] = useState(DEFAULT_BACKGROUND_COLOR);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const lastSyncedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
  }, [agent]);

  useEffect(() => {
    if (!data) return;
    if (lastSyncedAt.current === data.updatedAt) return;
    lastSyncedAt.current = data.updatedAt;
    setDraft({
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
        ctaColor: data?.ctaColor ?? DEFAULT_CTA_COLOR,
        backgroundColor: data?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
        logoUrl: data?.logoUrl ?? "",
      }),
    [agent, data],
  );

  const currentSnapshot = JSON.stringify({
    name,
    ctaColor: draft.ctaColor,
    backgroundColor: draft.backgroundColor,
    logoUrl: draft.logoUrl,
  });
  const isDirty = currentSnapshot !== savedSnapshot;
  const saving = updateAppearance.isPending || updateAgent.isPending;

  const handleSave = async () => {
    if (!canEdit) return;
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
        data: { name: name.trim() },
      });
      await updateAppearance.mutateAsync({
        id: agentId,
        data: {
          ctaColor,
          backgroundColor,
          logoUrl: draft.logoUrl.trim() || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAgentQueryKey(agentId) });
      queryClient.invalidateQueries({ queryKey: getGetAgentAppearanceQueryKey(agentId) });
      queryClient.invalidateQueries({ queryKey: getGetAgentEscalationQueryKey(agentId) });
      queryClient.invalidateQueries({ queryKey: getListInboxTeamsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      toast({
        title: "Appearance saved",
        description: "Name, colors, and logo are up to date.",
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
    if (!canEdit) return;
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
    if (!canEdit) return;
    const hex = normalizeHexColor(value);
    if (!hex) return;
    setDraft((prev) => ({ ...prev, ctaColor: hex }));
    setCtaHexInput(hex);
  };

  const setBackgroundColor = (value: string) => {
    if (!canEdit) return;
    const hex = normalizeHexColor(value);
    if (!hex) return;
    setDraft((prev) => ({ ...prev, backgroundColor: hex }));
    setBgHexInput(hex);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="space-y-3">
          <FieldBlock title="Name">
            <Label htmlFor={`agent-name-${agentId}`} className="sr-only">Name</Label>
            <Input
              id={`agent-name-${agentId}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={!canEdit}
              placeholder="e.g. Billing support"
            />
          </FieldBlock>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldBlock title="CTA color">
              <ColorField
                label="CTA color"
                value={draft.ctaColor}
                hexInput={ctaHexInput}
                onHexInputChange={setCtaHexInput}
                onCommit={setCtaColor}
                disabled={!canEdit}
              />
            </FieldBlock>

            <FieldBlock title="Background color">
              <ColorField
                label="Background color"
                value={draft.backgroundColor}
                hexInput={bgHexInput}
                onHexInputChange={setBgHexInput}
                onCommit={setBackgroundColor}
                disabled={!canEdit}
              />
            </FieldBlock>
          </div>

          <FieldBlock title="Logo">
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
                  <MutatingControls>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => logoFileRef.current?.click()}>
                      <Upload className="w-3.5 h-3.5 mr-1" />
                      Upload logo
                    </Button>
                    {draft.logoUrl && (
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDraft((prev) => ({ ...prev, logoUrl: "" }))}>
                        Remove
                      </Button>
                    )}
                  </MutatingControls>
                </div>
                <Input
                  placeholder="Or paste a logo image URL"
                  value={draft.logoUrl.startsWith("data:") ? "" : draft.logoUrl}
                  onChange={(e) => setDraft((prev) => ({ ...prev, logoUrl: e.target.value }))}
                  readOnly={!canEdit}
                  className="h-8 text-xs bg-background"
                />
                {canEdit ? (
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
                ) : null}
              </div>
            </div>
          </FieldBlock>

        </div>

        <div className="space-y-3">
          <ChatAppearancePreview
            name={name}
            ctaColor={isHexColor(draft.ctaColor) ? draft.ctaColor : DEFAULT_CTA_COLOR}
            backgroundColor={isHexColor(draft.backgroundColor) ? draft.backgroundColor : DEFAULT_BACKGROUND_COLOR}
            logoUrl={draft.logoUrl || null}
            className="rounded-xl border border-border shadow-sm overflow-hidden"
          />
          <div className="flex items-center justify-end">
            <MutatingControls>
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
            </MutatingControls>
          </div>
        </div>
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
  disabled,
}: {
  label: string;
  value: string;
  hexInput: string;
  onHexInputChange: (value: string) => void;
  onCommit: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={isHexColor(value) ? value : "#000000"}
        onChange={(e) => onCommit(e.target.value)}
        disabled={disabled}
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
        readOnly={disabled}
        className="h-9 font-mono text-xs uppercase"
        maxLength={7}
      />
    </div>
  );
}
