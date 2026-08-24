import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import {
  getListOrganizationsQueryKey,
  getListTeamsQueryKey,
  useListOrganizations,
  useListTeams,
} from "@workspace/api-client-react";

type TenantContextValue = {
  organizationId: string | null;
  teamId: string | null;
  organizations: Awaited<ReturnType<typeof import("@workspace/api-client-react").listOrganizations>>;
  teams: Awaited<ReturnType<typeof import("@workspace/api-client-react").listTeams>>;
  setOrganizationId: (id: string) => void;
  setTeamId: (id: string) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const organizationsQuery = useListOrganizations({
    query: { enabled: isLoaded && Boolean(isSignedIn), queryKey: getListOrganizationsQueryKey() },
  });
  const organizations = organizationsQuery.data ?? [];
  const [organizationId, setOrganizationId] = useState<string | null>(
    () => localStorage.getItem("orchestrator.organizationId"),
  );
  const selectedOrganizationId =
    organizations.some((item) => item.id === organizationId)
      ? organizationId
      : organizations[0]?.id ?? null;
  const teamsQuery = useListTeams(selectedOrganizationId ?? "", {
    query: { enabled: Boolean(selectedOrganizationId), queryKey: getListTeamsQueryKey(selectedOrganizationId ?? "") },
  });
  const teams = teamsQuery.data ?? [];
  const [teamId, setTeamId] = useState<string | null>(
    () => localStorage.getItem("orchestrator.teamId"),
  );
  const selectedTeamId =
    teams.some((item) => item.id === teamId) ? teamId : teams[0]?.id ?? null;

  useEffect(() => {
    if (selectedOrganizationId) {
      localStorage.setItem("orchestrator.organizationId", selectedOrganizationId);
      if (selectedOrganizationId !== organizationId) setOrganizationId(selectedOrganizationId);
    }
  }, [organizationId, selectedOrganizationId]);
  useEffect(() => {
    if (selectedTeamId) {
      localStorage.setItem("orchestrator.teamId", selectedTeamId);
      if (selectedTeamId !== teamId) setTeamId(selectedTeamId);
    }
  }, [selectedTeamId, teamId]);

  const value = useMemo(() => ({
    organizationId: selectedOrganizationId,
    teamId: selectedTeamId,
    organizations,
    teams,
    setOrganizationId,
    setTeamId,
  }), [organizations, selectedOrganizationId, selectedTeamId, setOrganizationId, setTeamId, teams]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenantContext() {
  const context = useContext(TenantContext);
  if (!context) throw new Error("useTenantContext must be used inside TenantProvider");
  return context;
}
