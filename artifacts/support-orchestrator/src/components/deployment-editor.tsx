import { useState } from "react";
import {
  useGetAgent,
  useUpdateAgent,
  getGetAgentQueryKey,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Rocket } from "lucide-react";
import { FaHtml5, FaReact, FaVuejs, FaAngular } from "react-icons/fa";
import type { IconType } from "react-icons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  MutatingControls,
  useWorkspaceAccess,
} from "@/components/workspace-access";

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

  if (isLoading || !agent) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading deployment settings...
      </p>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-lg border border-border bg-background p-4 space-y-3">
        <div className="pb-3 border-b border-border">
          <h3 className="text-sm font-medium">Agent status</h3>
          <p className="text-xs text-muted-foreground mt-1">
            New agents stay inactive until you enable them. Enable this agent
            when you are ready to go live.
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">
              {enabled ? "Active" : "Inactive"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {enabled
                ? "This agent is enabled and can be embedded on your site."
                : "This agent is not live yet."}
            </p>
          </div>
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
      </div>

      <div className="rounded-lg border border-border bg-background p-4 space-y-3">
        <div className="pb-3 border-b border-border">
          <h3 className="text-sm font-medium">Embed snippet</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Choose your stack and paste the snippet into your app to add the
            chat widget.
          </p>
        </div>

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
      </div>
    </div>
  );
}
