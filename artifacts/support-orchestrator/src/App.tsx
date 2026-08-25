import { type ReactNode, useEffect, useRef } from 'react';
import { ClerkProvider, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute } from '@/components/auth-provider';
import { AppearanceProvider } from '@/components/appearance-provider';
import Home from '@/pages/home';
import Login from '@/pages/login';
import Signup from '@/pages/signup';
import Chat from '@/pages/chat';
import Admin from '@/pages/admin';
import Dashboard from '@/pages/dashboard';
import Appearance from '@/pages/appearance';
import AgentsBoard from '@/pages/agents';
import CreateAgentPage from '@/pages/agent-new';
import EditAgentPage from '@/pages/agent-edit';
import Widget from '@/pages/widget';
import NotFound from '@/pages/not-found';
import ConnectionsPage from '@/pages/connections';

// REQUIRED — resolves key from hostname so same build serves multiple Clerk domains.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — empty in dev (intentional), auto-set in prod. Do NOT gate on NODE_ENV.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const queryClient = new QueryClient();

// Invalidates TanStack Query cache when signed-in user changes.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function AgentChat() {
  const params = useParams<{ id: string }>();
  return <Chat agentId={params.id} />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login/*?" component={Login} />
        <Route path="/signup/*?" component={Signup} />
        <Route path="/widget" component={Widget} />
        <Route path="/dashboard">
          <ProtectedRoute>
            <AppShell activeTab="dashboard">
              <Dashboard />
            </AppShell>
          </ProtectedRoute>
        </Route>
        <Route path="/connections">
          <ProtectedRoute>
            <AppShell activeTab="connections">
              <ConnectionsPage />
            </AppShell>
          </ProtectedRoute>
        </Route>
        <Route path="/agents/new">
          <ProtectedRoute>
            <AppShell activeTab="agents">
              <CreateAgentPage />
            </AppShell>
          </ProtectedRoute>
        </Route>
        <Route path="/agents/:id/chat">
          <ProtectedRoute>
            <AppShell activeTab="agents">
              <AgentChat />
            </AppShell>
          </ProtectedRoute>
        </Route>
        <Route path="/agents/:id/:section">
          <ProtectedRoute>
            <AppShell activeTab="agents">
              <EditAgentPage />
            </AppShell>
          </ProtectedRoute>
        </Route>
        <Route path="/agents/:id">
          <ProtectedRoute>
            <AppShell activeTab="agents">
              <EditAgentPage />
            </AppShell>
          </ProtectedRoute>
        </Route>
        <Route path="/agents">
          <ProtectedRoute>
            <AppShell activeTab="agents">
              <AgentsBoard />
            </AppShell>
          </ProtectedRoute>
        </Route>
        <Route path="/chat">
          <ProtectedRoute>
            <AppShell activeTab="chat">
              <Chat />
            </AppShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin">
          <ProtectedRoute>
            <AppShell activeTab="admin">
              <Admin />
            </AppShell>
          </ProtectedRoute>
        </Route>
        <Route path="/appearance">
          <ProtectedRoute>
            <AppShell activeTab="appearance">
              <Appearance />
            </AppShell>
          </ProtectedRoute>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/login`}
      signUpUrl={`${basePath}/signup`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppearanceProvider>
            <Router />
            <Toaster />
          </AppearanceProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
