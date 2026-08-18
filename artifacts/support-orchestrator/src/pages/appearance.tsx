import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetAppearance,
  useImportAppearance,
  useUpdateAppearance,
  getGetAppearanceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  ImagePlus,
  Loader2,
  Palette,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

export default function AppearancePage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetAppearance();
  const updateAppearance = useUpdateAppearance();
  const importAppearance = useImportAppearance();

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
        websiteUrl: data?.websiteUrl ?? "",
        ctaColor: data?.ctaColor ?? DEFAULT_CTA_COLOR,
        backgroundColor: data?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
        logoUrl: data?.logoUrl ?? "",
      }),
    [data],
  );

  const isDirty =
    JSON.stringify({
      websiteUrl: draft.websiteUrl,
      ctaColor: draft.ctaColor,
      backgroundColor: draft.backgroundColor,
      logoUrl: draft.logoUrl,
    }) !== savedSnapshot;

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.websiteUrl.trim() || importAppearance.isPending) return;

    importAppearance.mutate(
      { data: { url: draft.websiteUrl.trim() } },
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
          queryClient.invalidateQueries({ queryKey: getGetAppearanceQueryKey() });
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

  const handleSave = () => {
    const ctaColor = normalizeHexColor(draft.ctaColor);
    const backgroundColor = normalizeHexColor(draft.backgroundColor);
    if (!ctaColor || !backgroundColor) {
      toast({
        title: "Invalid colors",
        description: "CTA and background colors must be hex values like #0EA5E9.",
        variant: "destructive",
      });
      return;
    }

    updateAppearance.mutate(
      {
        data: {
          websiteUrl: draft.websiteUrl.trim() || null,
          ctaColor,
          backgroundColor,
          logoUrl: draft.logoUrl.trim() || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAppearanceQueryKey() });
          toast({
            title: "Appearance saved",
            description: "Your chat will now use these colors and logo.",
          });
        },
        onError: (error) => {
          toast({
            title: "Could not save appearance",
            description: error instanceof Error ? error.message : "Try again.",
            variant: "destructive",
          });
        },
      },
    );
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
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-14 px-6 border-b border-border flex items-center justify-between bg-card shrink-0 gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-medium tracking-tight">Appearance</h1>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs font-mono"
          onClick={handleSave}
          disabled={!isDirty || updateAppearance.isPending || isLoading}
        >
          {updateAppearance.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1" />
          )}
          SAVE
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
          <div className="space-y-6">
            <Card className="shadow-none border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-medium">Import from your website</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Enter your homepage URL. We will visit it and detect the main CTA color, background color, and logo so the chat can match your site.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleImport} className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <Label htmlFor="website-url" className="sr-only">Website homepage</Label>
                    <Input
                      id="website-url"
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      placeholder="https://www.your-website.com"
                      value={draft.websiteUrl}
                      onChange={(e) => setDraft((prev) => ({ ...prev, websiteUrl: e.target.value }))}
                      className="h-9 text-sm bg-background"
                    />
                  </div>
                  <Button type="submit" className="h-9 text-xs font-mono shrink-0" disabled={importAppearance.isPending || !draft.websiteUrl.trim()}>
                    {importAppearance.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {importAppearance.isPending ? "VISITING_SITE..." : "IMPORT_MAIN_STYLING"}
                  </Button>
                </form>
                {pageTitle && (
                  <p className="text-[11px] text-muted-foreground mt-3 font-mono">
                    Detected from: {pageTitle}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-none border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-medium">Colors</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Tune the imported CTA and background so the chat matches your website. Come back here anytime to change them.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ColorField
                  label="CTA color"
                  description="Buttons, header, and your chat bubbles"
                  value={draft.ctaColor}
                  hexInput={ctaHexInput}
                  onHexInputChange={setCtaHexInput}
                  onCommit={setCtaColor}
                  candidates={ctaCandidates}
                />
                <ColorField
                  label="Background color"
                  description="Chat panel background"
                  value={draft.backgroundColor}
                  hexInput={bgHexInput}
                  onHexInputChange={setBgHexInput}
                  onCommit={setBackgroundColor}
                  candidates={backgroundCandidates}
                />
              </CardContent>
            </Card>

            <Card className="shadow-none border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <ImagePlus className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-medium">Logo</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Imported from your website when available. You can change your logo anytime.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="border-primary/20 bg-primary/5">
                  <AlertDescription className="text-xs">
                    You can change your logo anytime — upload a new file, paste a URL, or re-import from your website.
                  </AlertDescription>
                </Alert>

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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => logoFileRef.current?.click()}
                      >
                        <Upload className="w-3.5 h-3.5 mr-1" />
                        Upload logo
                      </Button>
                      {draft.logoUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground"
                          onClick={() => setDraft((prev) => ({ ...prev, logoUrl: "" }))}
                        >
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
                  <div className="space-y-2">
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
              </CardContent>
            </Card>
          </div>

          <div className="xl:sticky xl:top-0 space-y-3">
            <div>
              <h2 className="text-sm font-medium">Chat preview</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                This is how the chat will look on your website.
              </p>
            </div>
            <ChatAppearancePreview
              ctaColor={isHexColor(draft.ctaColor) ? draft.ctaColor : DEFAULT_CTA_COLOR}
              backgroundColor={isHexColor(draft.backgroundColor) ? draft.backgroundColor : DEFAULT_BACKGROUND_COLOR}
              logoUrl={draft.logoUrl || null}
              className="rounded-xl border border-border shadow-sm overflow-hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  description,
  value,
  hexInput,
  onHexInputChange,
  onCommit,
  candidates,
}: {
  label: string;
  description: string;
  value: string;
  hexInput: string;
  onHexInputChange: (value: string) => void;
  onCommit: (value: string) => void;
  candidates: string[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">{label}</Label>
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
      </div>
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
                value.toUpperCase() === hex.toUpperCase()
                  ? "border-foreground ring-2 ring-ring"
                  : "border-border",
              )}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
