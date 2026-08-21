import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AGENT_CONFIG_STEPS,
  agentConfigHref,
  type AgentConfigStepId,
} from "@/lib/agent-config";

const GROUPS = [
  { id: "configuration", label: "Configuration" },
  { id: "deployment", label: "Deployment" },
  { id: "monitoring", label: "Monitoring" },
] as const;

export function AgentConfigSidebar({
  agentName,
  agentId,
  activeStep,
  isEnabled,
}: {
  agentName: string;
  agentId: string;
  activeStep: AgentConfigStepId;
  isEnabled: boolean;
}) {
  return (
    <aside className="hidden md:flex w-64 bg-card text-foreground border-r border-border flex-col flex-shrink-0">
      <div className="h-16 px-4 border-b border-border flex items-center gap-2.5 min-w-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" asChild>
          <Link href="/agents" aria-label="Back to agents">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <h2 className="text-sm font-semibold tracking-tight truncate flex-1 min-w-0">{agentName}</h2>
        <Badge
          className={cn(
            "shrink-0 border-transparent font-medium px-2.5 py-0.5 text-xs shadow-none",
            isEnabled
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isEnabled ? "Active" : "Inactive"}
        </Badge>
      </div>

      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-5">
        {GROUPS.map((group) => (
          <div key={group.id}>
            <p className="px-2.5 mb-2 text-xs font-medium text-muted-foreground/80">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {AGENT_CONFIG_STEPS.filter((step) => step.group === group.id).map((step) => {
                const Icon = step.icon;
                const isActive = step.id === activeStep;
                return (
                  <Link
                    key={step.id}
                    href={agentConfigHref(agentId, step.id)}
                    className={cn(
                      "relative flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-colors text-sm",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {step.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
