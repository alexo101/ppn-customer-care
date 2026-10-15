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
import { SidebarToggle } from "@/components/layout/sidebar-toggle";

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
  collapsed,
  onToggle,
}: {
  agentName: string;
  agentId: string;
  activeStep: AgentConfigStepId;
  isEnabled: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "hidden md:flex bg-card text-foreground border-r border-border flex-col flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {collapsed ? (
        <div className="h-16 flex items-center justify-center border-b border-border shrink-0">
          <SidebarToggle
            collapsed
            onToggle={onToggle}
            label="agent sidebar"
            className="text-muted-foreground hover:text-foreground"
          />
        </div>
      ) : (
        <div className="h-16 px-4 border-b border-border flex items-center gap-2.5 min-w-0 shrink-0">
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
          <SidebarToggle
            collapsed={false}
            onToggle={onToggle}
            label="agent sidebar"
            className="text-muted-foreground hover:text-foreground"
          />
        </div>
      )}

      <nav
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden py-5 space-y-5",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {collapsed && (
          <Link
            href="/agents"
            title="Back to agents"
            className="flex items-center justify-center h-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="sr-only">Back to agents</span>
          </Link>
        )}
        {GROUPS.map((group, index) => (
          <div key={group.id}>
            {collapsed ? (
              index > 0 && <div className="mx-2 mb-3 border-t border-border" />
            ) : (
              <p className="px-2.5 mb-2 text-xs font-medium text-muted-foreground/80 whitespace-nowrap">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {AGENT_CONFIG_STEPS.filter((step) => step.group === group.id).map((step) => {
                const Icon = step.icon;
                const isActive = step.id === activeStep;
                return (
                  <Link
                    key={step.id}
                    href={agentConfigHref(agentId, step.id)}
                    title={collapsed ? step.label : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 py-2.5 rounded-lg transition-colors text-sm whitespace-nowrap",
                      collapsed ? "justify-center px-0" : "px-2.5",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className={cn(collapsed && "sr-only")}>{step.label}</span>
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
