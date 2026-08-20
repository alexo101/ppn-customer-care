import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import {
  LayoutDashboard,
  Network,
  Bot,
  ChevronDown,
  LogOutIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppearance } from '@/components/appearance-provider';
import { useListAgents } from '@workspace/api-client-react';
import { agentConfigHref, parseAgentConfigLocation } from '@/lib/agent-config';
import { AgentConfigSidebar } from '@/components/layout/agent-config-sidebar';

export function AppShell({ children, activeTab = 'chat' }: { children: React.ReactNode; activeTab?: string }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const { data: agents = [] } = useListAgents();
  
  const { appearance } = useAppearance();
  const agentConfig = parseAgentConfigLocation(location);
  const agentsRouteActive = location === '/agents' || location.startsWith('/agents/');

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden text-sm">
      {/* Sidebar — 20% narrower than the previous w-64 (16rem → 12.8rem) */}
      <aside className="w-[12.8rem] bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col flex-shrink-0 relative z-20">
        <div className="h-14 flex items-center px-3 border-b border-sidebar-border font-medium tracking-tight">
          <Link href="/dashboard" className="flex items-center min-w-0">
            {appearance?.logoUrl ? (
              <img src={appearance.logoUrl} alt="Brand logo" className="w-5 h-5 mr-2 rounded-sm object-contain bg-white/90 p-px shrink-0" />
            ) : (
              <Network className="w-4 h-4 mr-2 text-sidebar-primary shrink-0" />
            )}
            <span className="font-mono text-[13px] truncate">SYS_ORCHESTRATOR</span>
          </Link>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          <p className="px-2 mb-1 text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/40">
            Core systems
          </p>
          <Link href="/dashboard" className={cn(
            "flex items-center gap-3 px-2 py-2 rounded-md transition-colors",
            location.startsWith('/dashboard')
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}>
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            Dashboard
          </Link>
          <div>
            <div className={cn(
              "flex items-center rounded-md transition-colors",
              location === '/agents' || location.startsWith('/agents/new')
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}>
              <Link href="/agents" className="flex items-center gap-3 px-2 py-2 flex-1 min-w-0">
                <Bot className="w-4 h-4 shrink-0" />
                Agents
              </Link>
              {agents.length > 0 && (
                <button
                  type="button"
                  className="p-2 mr-0.5 rounded-md hover:bg-sidebar-accent/80"
                  aria-label={agentsExpanded || agentsRouteActive ? "Collapse agents" : "Expand agents"}
                  onClick={() => setAgentsExpanded((open) => !open)}
                >
                  <ChevronDown className={cn(
                    "w-3.5 h-3.5 transition-transform",
                    !(agentsExpanded || agentsRouteActive) && "-rotate-90"
                  )} />
                </button>
              )}
            </div>
            {(agentsExpanded || agentsRouteActive) && agents.map((agent) => {
              const href = agentConfigHref(agent.id);
              const isActive = location === `/agents/${agent.id}` || location.startsWith(`/agents/${agent.id}/`);
              return (
                <Link
                  key={agent.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 ml-4 pl-2 pr-2 py-1.5 rounded-md transition-colors text-[13px]",
                    isActive
                      ? "bg-sidebar-primary/20 text-sidebar-primary font-medium"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-70" />
                  <span className="truncate">{agent.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        
        <div className="p-3 border-t border-sidebar-border flex items-center justify-between gap-1">
          <div className="flex items-center gap-2 overflow-hidden min-w-0">
            <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center text-[10px] font-medium shrink-0">
              {user?.primaryEmailAddress?.emailAddress.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="truncate text-xs min-w-0">
              <div className="font-medium truncate">{user?.primaryEmailAddress?.emailAddress || 'User'}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground shrink-0"
            title="Close session"
            aria-label="Close session"
            onClick={() => setSignOutOpen(true)}
          >
            <LogOutIcon className="w-3.5 h-3.5" />
          </Button>
        </div>
      </aside>

      {agentConfig && (
        <AgentConfigSidebar
          agentId={agentConfig.agentId}
          agentName={agents.find((agent) => agent.id === agentConfig.agentId)?.name || 'Agent'}
          activeStep={agentConfig.step}
          isEnabled={agents.find((agent) => agent.id === agentConfig.agentId)?.isEnabled ?? false}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background relative z-10">
        {children}
      </main>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close your session? You will need to sign in again to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => signOut()}>
              Close session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
