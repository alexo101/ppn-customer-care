import { useEffect, useState } from "react";
import {
  useGetAgent,
  useUpdateAgent,
  getGetAgentQueryKey,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus, Rocket, Save, X } from "lucide-react";
import { FaHtml5, FaReact, FaVuejs, FaAngular } from "react-icons/fa";
import type { IconType } from "react-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  MutatingControls,
  useWorkspaceAccess,
} from "@/components/workspace-access";
import { SettingsSection } from "@/components/settings-section";

const IFRAME_STYLE =
  "position:fixed;right:0;bottom:0;border:0;z-index:2147483647;width:420px;height:720px;background:transparent;";

type Snippet = {
  code: string;
  language: string;
  filename: string;
};

function widgetUrlFor(agentId: string) {
  const origin = window.location.origin;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${origin}${base}/widget?agentId=${encodeURIComponent(agentId)}`;
}

function htmlSnippet(widgetUrl: string): Snippet {
  return {
    language: "HTML",
    filename: "index.html",
    code: `<script>
  (function () {
    var iframe = document.createElement("iframe");
    iframe.src = ${JSON.stringify(widgetUrl)} + "&pageDomain=" + encodeURIComponent(window.location.hostname);
    iframe.title = "Support chat";
    iframe.style.cssText = ${JSON.stringify(IFRAME_STYLE)};
    document.body.appendChild(iframe);
  })();
</script>`,
  };
}

function reactSnippet(widgetUrl: string): Snippet {
  return {
    language: "TSX",
    filename: "SupportWidget.tsx",
    code: `import { useEffect } from "react";

const WIDGET_URL = ${JSON.stringify(widgetUrl)};
const IFRAME_STYLE = ${JSON.stringify(IFRAME_STYLE)};

export function SupportWidget() {
  useEffect(() => {
    const iframe = document.createElement("iframe");
    iframe.src = WIDGET_URL + "&pageDomain=" + encodeURIComponent(window.location.hostname);
    iframe.title = "Support chat";
    iframe.style.cssText = IFRAME_STYLE;
    document.body.appendChild(iframe);
    return () => {
      iframe.remove();
    };
  }, []);

  return null;
}`,
  };
}

function vueSnippet(widgetUrl: string): Snippet {
  return {
    language: "Vue",
    filename: "SupportWidget.vue",
    code: `<script setup>
import { onMounted, onUnmounted } from "vue";

const WIDGET_URL = ${JSON.stringify(widgetUrl)};
const IFRAME_STYLE = ${JSON.stringify(IFRAME_STYLE)};

let iframe;

onMounted(() => {
  iframe = document.createElement("iframe");
  iframe.src = WIDGET_URL + "&pageDomain=" + encodeURIComponent(window.location.hostname);
  iframe.title = "Support chat";
  iframe.style.cssText = IFRAME_STYLE;
  document.body.appendChild(iframe);
});

onUnmounted(() => {
  iframe?.remove();
});
</script>

<template></template>`,
  };
}

function angularSnippet(widgetUrl: string): Snippet {
  return {
    language: "TypeScript",
    filename: "support-widget.component.ts",
    code: `import { Component, OnInit, OnDestroy } from "@angular/core";

const WIDGET_URL = ${JSON.stringify(widgetUrl)};
const IFRAME_STYLE = ${JSON.stringify(IFRAME_STYLE)};

@Component({
  selector: "app-support-widget",
  standalone: true,
  template: "",
})
export class SupportWidgetComponent implements OnInit, OnDestroy {
  private iframe?: HTMLIFrameElement;

  ngOnInit() {
    this.iframe = document.createElement("iframe");
    this.iframe.src = WIDGET_URL + "&pageDomain=" + encodeURIComponent(window.location.hostname);
    this.iframe.title = "Support chat";
    this.iframe.style.cssText = IFRAME_STYLE;
    document.body.appendChild(this.iframe);
  }

  ngOnDestroy() {
    this.iframe?.remove();
  }
}`,
  };
}

const FRAMEWORKS: {
  id: string;
  label: string;
  icon: IconType;
  snippet: (widgetUrl: string) => Snippet;
}[] = [
  { id: "html", label: "Regular", icon: FaHtml5, snippet: htmlSnippet },
  { id: "react", label: "React", icon: FaReact, snippet: reactSnippet },
  { id: "vue", label: "Vue", icon: FaVuejs, snippet: vueSnippet },
  { id: "angular", label: "Angular", icon: FaAngular, snippet: angularSnippet },
];

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast({ title: "Snippet copied" });
    } catch {
      toast({
        title: "Could not copy snippet",
        description: "Select the code and copy it manually.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 text-xs shrink-0"
      onClick={copySnippet}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 mr-1" />
      ) : (
        <Copy className="w-3.5 h-3.5 mr-1" />
      )}
      {copied ? "Copied" : "Copy snippet"}
    </Button>
  );
}

export function DeploymentEditor({ agentId }: { agentId: string }) {
  const { canEdit } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const { data: agent, isLoading } = useGetAgent(agentId);
  const updateAgent = useUpdateAgent();
  const widgetUrl = widgetUrlFor(agentId);
  const enabled = Boolean(agent?.isEnabled);

  const [trustedDomains, setTrustedDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [savingDomains, setSavingDomains] = useState(false);

  useEffect(() => {
    if (agent?.trustedDomains) {
      setTrustedDomains(agent.trustedDomains);
    }
  }, [agent?.trustedDomains]);

  const setEnabled = async (isEnabled: boolean) => {
    if (!canEdit) return;
    try {
      await updateAgent.mutateAsync({ id: agentId, data: { isEnabled } });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getGetAgentQueryKey(agentId),
        }),
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() }),
      ]);
      toast({
        title: isEnabled ? "Agent enabled" : "Agent disabled",
        description: isEnabled
          ? "The widget snippet can now be used on your site."
          : "The agent is inactive until you enable it again.",
      });
    } catch (err) {
      toast({
        title: "Could not update agent",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const addDomain = () => {
    const domain = domainInput.trim().toLowerCase();
    if (!domain) return;
    if (trustedDomains.includes(domain)) {
      toast({ title: "Domain already added", variant: "destructive" });
      return;
    }
    setTrustedDomains([...trustedDomains, domain]);
    setDomainInput("");
  };

  const removeDomain = (domain: string) => {
    setTrustedDomains(trustedDomains.filter((d) => d !== domain));
  };

  const saveTrustedDomains = async () => {
    setSavingDomains(true);
    try {
      await updateAgent.mutateAsync({
        id: agentId,
        data: { trustedDomains },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetAgentQueryKey(agentId),
      });
      toast({ title: "Trusted domains saved" });
    } catch (err) {
      toast({
        title: "Could not save trusted domains",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingDomains(false);
    }
  };

  if (isLoading || !agent) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading deployment settings...
      </p>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex justify-end">
        <MutatingControls>
          <Button
            size="sm"
            variant={enabled ? "outline" : "default"}
            className="h-8 text-xs shrink-0"
            disabled={updateAgent.isPending}
            onClick={() => setEnabled(!enabled)}
          >
            <Rocket className="w-3.5 h-3.5 mr-1" />
            {enabled ? "Disable agent" : "Enable agent"}
          </Button>
        </MutatingControls>
      </div>

      <SettingsSection title="Embed snippet">
        <Tabs defaultValue="html">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
            {FRAMEWORKS.map((framework) => {
              const Icon = framework.icon;
              return (
                <TabsTrigger
                  key={framework.id}
                  value={framework.id}
                  className="gap-1.5"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {framework.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {FRAMEWORKS.map((framework) => {
            const snippet = framework.snippet(widgetUrl);
            return (
              <TabsContent
                key={framework.id}
                value={framework.id}
                className="mt-3 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor={`embed-snippet-${framework.id}`}
                    className="text-xs"
                  >
                    {snippet.language}
                    <span className="ml-1.5 text-muted-foreground font-normal">
                      {snippet.filename}
                    </span>
                  </Label>
                  <CopyButton code={snippet.code} />
                </div>
                <Textarea
                  id={`embed-snippet-${framework.id}`}
                  readOnly
                  value={snippet.code}
                  className="font-mono text-[11px] min-h-[220px] resize-none"
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </SettingsSection>

      <SettingsSection title="Security" defaultOpen={false}>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Trusted domains</Label>
            <p className="text-xs text-muted-foreground">
              Restrict the embed snippet to only work on these domains. If no
              domains are listed, the snippet will work on any website.
            </p>
          </div>

          {trustedDomains.length > 0 && (
            <ul className="space-y-1.5">
              {trustedDomains.map((domain) => (
                <li
                  key={domain}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm"
                >
                  <span className="truncate">{domain}</span>
                  <MutatingControls>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeDomain(domain)}
                      aria-label={`Remove ${domain}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </MutatingControls>
                </li>
              ))}
            </ul>
          )}

          <MutatingControls>
            <div className="flex gap-2">
              <Input
                placeholder="example.com"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDomain();
                  }
                }}
                disabled={!canEdit}
                className="flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 shrink-0"
                disabled={!canEdit || !domainInput.trim()}
                onClick={addDomain}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          </MutatingControls>
        </div>

        <MutatingControls>
          <Button
            onClick={() => void saveTrustedDomains()}
            disabled={savingDomains}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {savingDomains ? "Saving..." : "Save security settings"}
          </Button>
        </MutatingControls>
      </SettingsSection>
    </div>
  );
}
