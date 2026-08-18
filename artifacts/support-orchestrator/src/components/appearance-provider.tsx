import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { useGetAppearance, getGetAppearanceQueryKey } from "@workspace/api-client-react";
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

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { data, isLoading } = useGetAppearance({
    query: {
      enabled: isLoaded && Boolean(isSignedIn),
      queryKey: getGetAppearanceQueryKey(),
    },
  });

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
