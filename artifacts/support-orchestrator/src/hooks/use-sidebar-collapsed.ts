import { useCallback, useEffect, useState } from "react";

// Remembers whether a sidebar is collapsed, per browser, under the given key.
export function useSidebarCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(collapsed));
    } catch {
      // Storage can be unavailable (e.g. private mode); the toggle still works for this session.
    }
  }, [storageKey, collapsed]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);

  return [collapsed, toggle] as const;
}
