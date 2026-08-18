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

export function AgentConfigSidebar({
  agentName,
  agentId,
  activeStep,
}: {
  agentName: string;
  agentId: string;
  activeStep: AgentConfigStepId;
}) {
  return (
    <aside className="w-56 bg-card text-foreground border-r border-border flex flex-col flex-shrink-0">
      <div className="h-14 px-3 border-b border-border flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link href="/agents" aria-label="Back to agents">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <h2 className="text-sm font-medium tracking-tight truncate flex-1 min-w-0">{agentName}</h2>
        <Badge className="shrink-0 border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium px-2 py-0.5 text-[10px] uppercase tracking-wide rounded-full shadow-none">
          Active
        </Badge>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <p className="px-2 mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Configuration
        </p>
        <div className="space-y-0.5">
          {AGENT_CONFIG_STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = step.id === activeStep;
            return (
              <Link
                key={step.id}
                href={agentConfigHref(agentId, step.id)}
                className={cn(
                  "flex items-center gap-2.5 px-2 py-2 rounded-md transition-colors text-[13px]",
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
      </nav>
    </aside>
  );
}
