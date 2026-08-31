export type InboxTeamOption = {
  agentId: string;
  teamName: string;
  openCount: number;
};

export function inboxTeamLabel(name: string | null | undefined) {
  const trimmed = name?.trim() ?? "";
  return trimmed || "Escalation team";
}

export function inboxTeamsFromConfigured(
  teams: Array<{
    agentId: string;
    teamName: string;
    openCount?: number;
  }>,
): InboxTeamOption[] {
  return [...teams]
    .map((team) => ({
      agentId: team.agentId,
      teamName: inboxTeamLabel(team.teamName),
      openCount: team.openCount ?? 0,
    }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
}
