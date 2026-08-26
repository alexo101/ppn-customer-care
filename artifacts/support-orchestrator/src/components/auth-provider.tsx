import { useEffect } from "react";
import { useAuth, useClerk } from "@clerk/react";
import { Redirect, useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { WorkspaceAccessProvider } from "@/components/workspace-access";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const me = useGetMe({
    query: {
      enabled: isLoaded && Boolean(isSignedIn),
      queryKey: getGetMeQueryKey(),
      retry: false,
    },
  });

  useEffect(() => {
    if (!isSignedIn || errorStatus(me.error) !== 403) return;
    void signOut().then(() => {
      setLocation("/login?error=forbidden");
    });
  }, [isSignedIn, me.error, setLocation, signOut]);

  if (!isLoaded || (isSignedIn && me.isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/login" />;
  }

  if (errorStatus(me.error) === 403) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (me.error || !me.data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-sm text-destructive text-center">
          Could not load your workspace access. Try signing in again.
        </p>
      </div>
    );
  }

  return (
    <WorkspaceAccessProvider email={me.data.email} role={me.data.role}>
      {children}
    </WorkspaceAccessProvider>
  );
};
