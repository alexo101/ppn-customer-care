import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type InboxTeamOption = {
  agentId: string;
  teamName: string;
  openCount: number;
};

export function InboxTeamRail({
  teams,
  selectedTeamId,
  isLoading,
  onSelect,
}: {
  teams: InboxTeamOption[];
  selectedTeamId: string | null;
  isLoading?: boolean;
  onSelect: (teamId: string | null) => void;
}) {
  const allCount = teams.reduce((sum, team) => sum + team.openCount, 0);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-background">
      <div className="px-4 pb-2 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Escalation teams
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 pb-4">
        {isLoading ? (
          <div className="space-y-2 px-2 py-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <>
            <TeamRow
              label="All teams"
              count={allCount}
              active={selectedTeamId === null}
              onClick={() => onSelect(null)}
            />
            {teams.map((team) => (
              <TeamRow
                key={team.agentId}
                label={team.teamName}
                count={team.openCount}
                active={selectedTeamId === team.agentId}
                onClick={() => onSelect(team.agentId)}
              />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}

function TeamRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-foreground/80 hover:bg-muted",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "ml-2 min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px]",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
