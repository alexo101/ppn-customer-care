import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { Navbar } from '@/components/layout/Navbar';
import { HomePage } from '@/pages/HomePage';
import { ChatPage } from '@/pages/ChatPage';
import { AdminPage } from '@/pages/AdminPage';
import { WidgetPage } from '@/pages/WidgetPage';
import { LoginPage } from '@/pages/LoginPage';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const fullWidth = location.pathname === '/admin' || location.pathname === '/chat';
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar fullWidth={fullWidth} />
      {children}
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function HomeRoute() {
  const navigate = useNavigate();
  return (
    <AppShell>
      <HomePage onNavigate={(p) => navigate(`/${p}`)} />
    </AppShell>
  );
}

function ChatRoute() {
  return (
    <ProtectedRoute>
      <AppShell>
        <ChatPage />
      </AppShell>
    </ProtectedRoute>
  );
}

function AdminRoute() {
  return (
    <ProtectedRoute>
      <AppShell>
        <AdminPage />
      </AppShell>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<LoginPage mode="login" />} />
      <Route path="/register" element={<LoginPage mode="signup" />} />
      <Route path="/chat" element={<ChatRoute />} />
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="/widget" element={<WidgetPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
