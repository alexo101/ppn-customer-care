import { useParams } from "wouter";
import { useGetAgent } from "@workspace/api-client-react";
import { CategoriesTab, ConversationsTab, RulesTab, SourcesTab } from "@/pages/admin";
import { AppearanceEditor } from "@/components/appearance-editor";
import { AGENT_CONFIG_STEPS, isAgentConfigStep } from "@/lib/agent-config";

export default function EditAgentPage() {
  const params = useParams<{ id: string; section?: string }>();
  const agentId = params.id;
  const section = params.section === "conversations" ? "training" : params.section;
  const stepId = isAgentConfigStep(section) ? section : "appearance";
  const step = AGENT_CONFIG_STEPS.find((item) => item.id === stepId)!;
  const { isLoading } = useGetAgent(agentId);

  if (!agentId) return null;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-14 px-6 border-b border-border flex items-center bg-card shrink-0">
        <h1 className="text-lg font-medium tracking-tight truncate">{step.label}</h1>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading agent...</p>
          ) : (
            <>
              {stepId === "appearance" && <AppearanceEditor agentId={agentId} />}
              {stepId === "training" && <ConversationsTab agentId={agentId} />}
              {stepId === "categories" && <CategoriesTab agentId={agentId} />}
              {stepId === "rules" && <RulesTab agentId={agentId} />}
              {stepId === "sources" && <SourcesTab agentId={agentId} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
