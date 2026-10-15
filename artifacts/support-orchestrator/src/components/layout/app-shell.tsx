import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, useClerk, useUser } from "@clerk/react";
import {
  Network,
  Bot,
  Inbox,
  LogOutIcon,
  Menu,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  getGetInboxUnreadCountQueryKey,
  useGetInboxUnreadCount,
  useListAgents,
} from "@workspace/api-client-react";
import { agentConfigHref, parseAgentConfigLocation } from "@/lib/agent-config";
import { getInboxUnreadCountQueryOptions } from "@/lib/escalation-query-options";
import { AgentConfigSidebar } from "@/components/layout/agent-config-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { getUserAgentsQueryKey } from "@/lib/agents-query";
import { useWorkspaceAccess } from "@/components/workspace-access";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";

const NAV_COLLAPSED_KEY = "orchestrator.sidebar.navigation.collapsed";
const AGENT_COLLAPSED_KEY = "orchestrator.sidebar.agent.collapsed";

function BrandMark() {
  return (
    <Link href="/agents" className="flex items-center gap-2 min-w-0">
      <span className="flex items-center justify-center w-6 h-6 rounded-md bg-sidebar-primary/15 text-sidebar-primary shrink-0">
        <Network className="w-3.5 h-3.5" />
      </span>
      <span className="font-semibold text-sm tracking-tight truncate">
        Orchestrator
      </span>
    </Link>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed = false,
  onNavigate,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        "relative flex items-center gap-3 py-2.5 rounded-lg transition-colors whitespace-nowrap",
        collapsed ? "justify-center px-0" : "px-2.5",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-sidebar-primary" />
      )}
      <Icon className="w-4 h-4 shrink-0" />
      <span className={cn(collapsed && "sr-only")}>{label}</span>
      {badge}
    </Link>
  );
}

function NavLinks({
  location,
  agents,
  agentConfigHrefFn,
  onNavigate,
  unreadCount,
  collapsed = false,
}: {
  location: string;
  agents: { id: string; name: string }[];
  agentConfigHrefFn: (id: string) => string;
  onNavigate?: () => void;
  unreadCount: number;
  collapsed?: boolean;
}) {
  const inboxBadge =
    unreadCount > 0 ? (
      collapsed ? (
        <span
          aria-label={`${unreadCount} unread`}
          className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-destructive"
        />
      ) : (
        <span className="ml-auto min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-center text-[10px] font-semibold text-destructive-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )
    ) : null;

  return (
    <nav
      className={cn(
        "flex-1 overflow-y-auto overflow-x-hidden py-5 space-y-1.5",
        collapsed ? "px-2" : "px-3",
      )}
    >
      {collapsed ? (
        <div className="mx-2 mb-2 border-t border-sidebar-border" />
      ) : (
        <p className="px-2.5 mb-2 text-xs font-medium text-sidebar-foreground/45 whitespace-nowrap">
          Workspace
        </p>
      )}
      <NavItem
        href="/inbox"
        icon={Inbox}
        label="Inbox"
        active={location.startsWith("/inbox")}
        collapsed={collapsed}
        onNavigate={onNavigate}
        badge={inboxBadge}
      />
      <NavItem
        href="/team"
        icon={Users}
        label="Team"
        active={location.startsWith("/team")}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      <NavItem
        href="/agents"
        icon={Bot}
        label="Agents"
        active={location === "/agents" || location.startsWith("/agents/new")}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      {!collapsed && agents.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {agents.map((agent) => {
            const href = agentConfigHrefFn(agent.id);
            const isActive =
              location === `/agents/${agent.id}` ||
              location.startsWith(`/agents/${agent.id}/`);
            return (
              <Link
                key={agent.id}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 ml-4 pl-2.5 pr-2.5 py-2 rounded-lg transition-colors text-sm",
                  isActive
                    ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-70" />
                <span className="truncate">{agent.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}

export function AppShell({
  children,
  activeTab = "chat",
}: {
  children: React.ReactNode;
  activeTab?: string;
}) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { canEdit } = useWorkspaceAccess();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navCollapsed, toggleNavCollapsed] = useSidebarCollapsed(NAV_COLLAPSED_KEY);
  const [agentCollapsed, toggleAgentCollapsed] = useSidebarCollapsed(AGENT_COLLAPSED_KEY);
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { data: agents = [] } = useListAgents({
    query: {
      enabled: isLoaded && isSignedIn && Boolean(userId),
      queryKey: getUserAgentsQueryKey(userId),
      refetchOnMount: "always",
      staleTime: 0,
    },
  });
  const { data: unreadData } = useGetInboxUnreadCount({
    query: getInboxUnreadCountQueryOptions(),
  });
  const unreadCount = unreadData?.count ?? 0;

  const agentConfig = parseAgentConfigLocation(location);

  const userInitial =
    user?.primaryEmailAddress?.emailAddress.charAt(0).toUpperCase() || "U";

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background overflow-hidden text-sm">
      {/* Mobile top bar */}
      <div className="md:hidden h-14 flex items-center gap-2 px-3 border-b border-border bg-card shrink-0 z-30">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="w-4 h-4" />
        </Button>
        <BrandMark />
      </div>

      <div className="flex flex-1 w-full overflow-hidden">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "hidden md:flex bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-col flex-shrink-0 relative z-20 overflow-hidden transition-[width] duration-200 ease-in-out",
            navCollapsed ? "w-16" : "w-60",
          )}
        >
          <div
            className={cn(
              "h-16 flex items-center border-b border-sidebar-border shrink-0",
              navCollapsed ? "justify-center px-2" : "justify-between gap-2 px-4",
            )}
          >
            {!navCollapsed && <BrandMark />}
            <SidebarToggle
              collapsed={navCollapsed}
              onToggle={toggleNavCollapsed}
              label="navigation sidebar"
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
            />
          </div>

          <NavLinks
            location={location}
            agents={agents}
            agentConfigHrefFn={agentConfigHref}
            unreadCount={unreadCount}
            collapsed={navCollapsed}
          />

          <div
            className={cn(
              "border-t border-sidebar-border flex items-center gap-1 shrink-0",
              navCollapsed ? "flex-col p-2" : "justify-between p-3",
            )}
          >
            <div
              className={cn(
                "flex items-center min-w-0",
                navCollapsed ? "justify-center" : "gap-2.5 overflow-hidden",
              )}
            >
              <div
                title={user?.primaryEmailAddress?.emailAddress || "User"}
                className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium shrink-0"
              >
                {userInitial}
              </div>
              {!navCollapsed && (
                <div className="truncate text-xs min-w-0">
                  <div className="font-medium truncate">
                    {user?.primaryEmailAddress?.emailAddress || "User"}
                  </div>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground shrink-0"
              title="Sign out"
              aria-label="Sign out"
              onClick={() => setSignOutOpen(true)}
            >
              <LogOutIcon className="w-4 h-4" />
            </Button>
          </div>
        </aside>

        {/* Mobile nav drawer */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            className="p-0 w-64 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
              <BrandMark />
            </div>
            <NavLinks
              location={location}
              agents={agents}
              agentConfigHrefFn={agentConfigHref}
              unreadCount={unreadCount}
              onNavigate={() => setMobileNavOpen(false)}
            />
            <div className="p-3 border-t border-sidebar-border flex items-center justify-between gap-1">
              <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium shrink-0">
                  {userInitial}
                </div>
                <div className="truncate text-xs min-w-0">
                  <div className="font-medium truncate">
                    {user?.primaryEmailAddress?.emailAddress || "User"}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground shrink-0"
                title="Sign out"
                aria-label="Sign out"
                onClick={() => setSignOutOpen(true)}
              >
                <LogOutIcon className="w-4 h-4" />
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {agentConfig && (
          <AgentConfigSidebar
            agentId={agentConfig.agentId}
            agentName={
              agents.find((agent) => agent.id === agentConfig.agentId)?.name ||
              "Agent"
            }
            activeStep={agentConfig.step}
            isEnabled={
              agents.find((agent) => agent.id === agentConfig.agentId)
                ?.isEnabled ?? false
            }
            collapsed={agentCollapsed}
            onToggle={toggleAgentCollapsed}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-background relative z-10 overflow-hidden">
          {!canEdit && (
            <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-200">
              View only — you can browse this workspace but cannot change
              configuration.
            </div>
          )}
          {children}
        </main>
      </div>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out? You will need to sign in again
              to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => signOut()}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
