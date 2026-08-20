import { useState } from "react";
import {
  useGetAgent,
  useUpdateAgent,
  getGetAgentQueryKey,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

function widgetEmbedSnippet(agentId: string) {
  const origin = window.location.origin;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const widgetUrl = `${origin}${base}/widget?agentId=${encodeURIComponent(agentId)}`;
  return `<script>
  (function () {
    var iframe = document.createElement("iframe");
    iframe.src = ${JSON.stringify(widgetUrl)};
    iframe.title = "Support chat";
    iframe.style.cssText = "position:fixed;right:0;bottom:0;border:0;z-index:2147483647;width:420px;height:720px;background:transparent;";
    document.body.appendChild(iframe);
  })();
</script>`;
}

export function DeploymentEditor({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const { data: agent, isLoading } = useGetAgent(agentId);
  const updateAgent = useUpdateAgent();
  const [copied, setCopied] = useState(false);
  const snippet = widgetEmbedSnippet(agentId);
  const enabled = Boolean(agent?.isEnabled);

  const setEnabled = async (isEnabled: boolean) => {
    try {
      await updateAgent.mutateAsync({ id: agentId, data: { isEnabled } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAgentQueryKey(agentId) }),
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

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
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

  if (isLoading || !agent) {
    return <p className="text-sm text-muted-foreground">Loading deployment settings...</p>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-lg border border-border bg-background p-4 space-y-3">
        <div className="pb-3 border-b border-border">
          <h3 className="text-sm font-medium">Agent status</h3>
          <p className="text-xs text-muted-foreground mt-1">
            New agents stay inactive until you enable them. Enable this agent when you are ready to go live.
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{enabled ? "Active" : "Inactive"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {enabled
                ? "This agent is enabled and can be embedded on your site."
                : "This agent is not live yet."}
            </p>
          </div>
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
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 space-y-3">
        <div className="pb-3 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Embed snippet</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Paste this code before the closing body tag on your website to add the chat widget.
            </p>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={copySnippet}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? "Copied" : "Copy snippet"}
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="embed-snippet" className="text-xs">HTML</Label>
          <Textarea
            id="embed-snippet"
            readOnly
            value={snippet}
            className="font-mono text-[11px] min-h-[180px] resize-none"
          />
        </div>
      </div>
    </div>
  );
}
