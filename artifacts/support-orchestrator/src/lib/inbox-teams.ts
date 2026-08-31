export type InboxTeamOption = {
  agentId: string;
  teamName: string;
  openCount: number;
};

export const DEFAULT_ESCALATION_TEAM_NAME = "Escalation team";

export function inboxTeamLabel(
  name: string | null | undefined,
  agentName?: string | null,
) {
  const trimmed = name?.trim() ?? "";
  if (trimmed && trimmed !== DEFAULT_ESCALATION_TEAM_NAME) return trimmed;
  const fromAgent = agentName?.trim() ?? "";
  return fromAgent || DEFAULT_ESCALATION_TEAM_NAME;
}

export function inboxTeamsFromConfigured(
  teams: Array<{
    agentId: string;
    teamName: string;
    agentName?: string;
    openCount?: number;
  }>,
): InboxTeamOption[] {
  return [...teams]
    .map((team) => ({
      agentId: team.agentId,
      teamName: inboxTeamLabel(team.teamName, team.agentName),
      openCount: team.openCount ?? 0,
    }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
}
