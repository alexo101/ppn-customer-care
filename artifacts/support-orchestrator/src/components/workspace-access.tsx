import { createContext, useContext, type ReactNode } from "react";
import type { MemberRole } from "@workspace/api-client-react";

type WorkspaceAccessValue = {
  email: string;
  role: MemberRole;
  canEdit: boolean;
};

const WorkspaceAccessContext = createContext<WorkspaceAccessValue | null>(null);

export function WorkspaceAccessProvider({
  email,
  role,
  children,
}: {
  email: string;
  role: MemberRole;
  children: ReactNode;
}) {
  return (
    <WorkspaceAccessContext.Provider
      value={{ email, role, canEdit: role === "editor" }}
    >
      {children}
    </WorkspaceAccessContext.Provider>
  );
}

export function useWorkspaceAccess(): WorkspaceAccessValue {
  const value = useContext(WorkspaceAccessContext);
  if (!value) {
    throw new Error("useWorkspaceAccess must be used within WorkspaceAccessProvider");
  }
  return value;
}

export function MutatingControls({ children }: { children: ReactNode }) {
  const { canEdit } = useWorkspaceAccess();
  if (!canEdit) return null;
  return <>{children}</>;
}
