import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import {
  LayoutDashboard,
  MessageSquare,
  Network,
  LogOut,
  FolderTree,
  GitMerge,
  Database,
  Terminal,
  LogOutIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function AppShell({ children, activeTab = 'chat' }: { children: React.ReactNode; activeTab?: string }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  
  const navItems = [
    { icon: MessageSquare, label: 'Orchestrator', href: '/chat', match: '/chat' },
    { icon: LayoutDashboard, label: 'Analytics', href: '/admin', match: '/admin' },
  ];

  const adminTabs = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/admin?tab=dashboard', match: 'dashboard' },
    { icon: MessageSquare, label: 'Conversations', href: '/admin?tab=conversations', match: 'conversations' },
    { icon: FolderTree, label: 'Categories', href: '/admin?tab=categories', match: 'categories' },
    { icon: GitMerge, label: 'Rules', href: '/admin?tab=rules', match: 'rules' },
    { icon: Database, label: 'Sources', href: '/admin?tab=sources', match: 'sources' },
  ];
  
  const isAdmin = location.startsWith('/admin');

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden text-sm">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col flex-shrink-0 relative z-20">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border font-medium tracking-tight">
          <Network className="w-4 h-4 mr-2 text-sidebar-primary" />
          <span className="font-mono text-[13px]">SYS_ORCHESTRATOR</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <div className="text-[10px] uppercase font-mono tracking-wider text-sidebar-foreground/50 mb-2 px-2">Core Systems</div>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 px-2 py-2 rounded-md transition-colors",
              location.startsWith(item.match) 
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}

          {isAdmin && (
            <>
              <div className="text-[10px] uppercase font-mono tracking-wider text-sidebar-foreground/50 mt-6 mb-2 px-2">Configuration</div>
              {adminTabs.map((item) => {
                const currentTab = new URLSearchParams(window.location.search).get('tab') || 'dashboard';
                const isActive = currentTab === item.match;
                
                return (
                  <Link key={item.match} href={item.href} className={cn(
                    "flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors text-[13px]",
                    isActive
                      ? "bg-sidebar-primary/20 text-sidebar-primary font-medium" 
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}>
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center text-[10px] font-medium shrink-0">
              {user?.primaryEmailAddress?.emailAddress.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="truncate text-xs">
              <div className="font-medium truncate">{user?.primaryEmailAddress?.emailAddress || 'User'}</div>
              <div className="text-[10px] text-sidebar-foreground/50 font-mono">OP_CLEARANCE_1</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground" onClick={() => signOut()}>
            <LogOutIcon className="w-3.5 h-3.5" />
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background relative z-10">
        {children}
      </main>
    </div>
  );
}
