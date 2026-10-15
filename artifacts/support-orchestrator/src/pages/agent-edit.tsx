import { Link, Redirect, useLocation, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useGetAgent } from "@workspace/api-client-react";
import { TargetsTab } from "@/pages/admin";
import { AppearanceEditor } from "@/components/appearance-editor";
import { DeploymentEditor } from "@/components/deployment-editor";
import { MonitoringEditor } from "@/components/monitoring-editor";
import { TrainingEditor } from "@/components/training-editor";
import { EscalationEditor } from "@/components/escalation-editor";
import { ConversationSettingsEditor } from "@/components/conversation-settings-editor";
import { KnowledgeBaseTab } from "@/components/knowledge-base-tab";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENT_CONFIG_STEPS,
  agentConfigHref,
  isAgentConfigStep,
} from "@/lib/agent-config";

export default function EditAgentPage() {
  const params = useParams<{ id: string; section?: string }>();
  const [, setLocation] = useLocation();
  const agentId = params.id;
  const section =
    params.section === "conversations" ? "training" : params.section;
  const stepId = isAgentConfigStep(section) ? section : "appearance";
  const step = AGENT_CONFIG_STEPS.find((item) => item.id === stepId)!;
  const { isLoading } = useGetAgent(agentId ?? "");
  const fillViewport = stepId === "training";

  if (!agentId) return null;
  if (section === "sources") {
    return <Redirect to={agentConfigHref(agentId, "knowledge-base")} />;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-16 px-6 md:px-8 border-b border-border flex items-center gap-2 bg-card shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 -ml-2 md:hidden"
          asChild
        >
          <Link href="/agents" aria-label="Back to agents">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight truncate hidden md:block">
          {step.label}
        </h1>
        <div className="md:hidden flex-1 min-w-0">
          <Select
            value={stepId}
            onValueChange={(value) =>
              setLocation(agentConfigHref(agentId, value as typeof stepId))
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue>{step.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AGENT_CONFIG_STEPS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        className={
          fillViewport
            ? "flex-1 min-h-0 overflow-hidden"
            : "flex-1 overflow-auto p-6 md:p-8"
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-6">Loading agent…</p>
        ) : fillViewport ? (
          <TrainingEditor agentId={agentId} />
        ) : (
          <div className="max-w-7xl mx-auto">
            {stepId === "appearance" && <AppearanceEditor agentId={agentId} />}
            {stepId === "knowledge-base" && <KnowledgeBaseTab agentId={agentId} />}
            {stepId === "escalations" && <EscalationEditor agentId={agentId} />}
            {stepId === "conversation-settings" && (
              <ConversationSettingsEditor agentId={agentId} />
            )}
            {stepId === "targets" && <TargetsTab agentId={agentId} />}
            {stepId === "deployment" && <DeploymentEditor agentId={agentId} />}
            {stepId === "monitoring" && <MonitoringEditor agentId={agentId} />}
          </div>
        )}
      </div>
    </div>
  );
}
