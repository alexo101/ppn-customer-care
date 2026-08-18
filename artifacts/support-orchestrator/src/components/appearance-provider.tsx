import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { useLocation } from "wouter";
import {
  useGetAppearance,
  useGetAgentAppearance,
  getGetAppearanceQueryKey,
  getGetAgentAppearanceQueryKey,
} from "@workspace/api-client-react";
import type { Appearance } from "@workspace/api-client-react";
import { applyCtaCssVars, clearCtaCssVars } from "@/lib/appearance-theme";

type AppearanceContextValue = {
  appearance: Appearance | undefined;
  isLoading: boolean;
};

const AppearanceContext = createContext<AppearanceContextValue>({
  appearance: undefined,
  isLoading: false,
});

function currentAgentId(location: string) {
  const match = location.match(/^\/agents\/([^/]+)/);
  if (!match) return undefined;
  if (match[1] === "new") return undefined;
  return match[1];
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();
  const agentId = currentAgentId(location);
  const signedIn = isLoaded && Boolean(isSignedIn);

  const globalAppearance = useGetAppearance({
    query: {
      enabled: signedIn && !agentId,
      queryKey: getGetAppearanceQueryKey(),
    },
  });
  const agentAppearance = useGetAgentAppearance(agentId ?? "", {
    query: {
      enabled: signedIn && Boolean(agentId),
      queryKey: agentId ? getGetAgentAppearanceQueryKey(agentId) : ["disabled-agent-appearance"],
    },
  });

  const data = agentId ? agentAppearance.data : globalAppearance.data;
  const isLoading = agentId ? agentAppearance.isLoading : globalAppearance.isLoading;

  useEffect(() => {
    if (!data) return;
    applyCtaCssVars(document.documentElement, data.ctaColor);
    return () => {
      clearCtaCssVars(document.documentElement);
    };
  }, [data]);

  return (
    <AppearanceContext.Provider value={{ appearance: data, isLoading }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
