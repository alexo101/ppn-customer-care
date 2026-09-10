import { Search, X } from "lucide-react";
import type { InboxTeam } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  INBOX_STATUS_TAB_LABELS,
  INBOX_STATUS_TABS,
  type InboxStatusTab,
} from "@/lib/inbox-status";
import type { InboxSort } from "@/lib/inbox-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AssigneeFilter = "everyone" | "mine" | "unassigned";

export function InboxToolbar({
  status,
  statusCounts,
  search,
  teams,
  selectedTeamId,
  categories,
  category,
  assignee,
  sort,
  onStatusChange,
  onSearchChange,
  onTeamChange,
  onCategoryChange,
  onAssigneeChange,
  onSortChange,
  onClearFilters,
}: {
  status: InboxStatusTab;
  statusCounts: Record<InboxStatusTab, number>;
  search: string;
  teams: InboxTeam[];
  selectedTeamId: string | null;
  categories: string[];
  category: string | null;
  assignee: AssigneeFilter;
  sort: InboxSort;
  onStatusChange: (status: InboxStatusTab) => void;
  onSearchChange: (value: string) => void;
  onTeamChange: (teamId: string | null) => void;
  onCategoryChange: (category: string | null) => void;
  onAssigneeChange: (assignee: AssigneeFilter) => void;
  onSortChange: (sort: InboxSort) => void;
  onClearFilters: () => void;
}) {
  const selectedTeam = teams.find((team) => team.agentId === selectedTeamId);
  const filterCount =
    Number(Boolean(selectedTeamId)) +
    Number(Boolean(category)) +
    Number(assignee !== "everyone");
  const hasFilters = filterCount > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-background p-1">
          {INBOX_STATUS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onStatusChange(tab)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                status === tab
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {INBOX_STATUS_TAB_LABELS[tab]}
              <span
                className={cn(
                  "min-w-4 text-[11px]",
                  status === tab ? "text-background/80" : "text-muted-foreground",
                )}
              >
                {statusCounts[tab]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search customer, message, ID..."
            className="h-9 bg-background pl-8 text-xs"
            aria-label="Search escalations"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selectedTeamId ?? "all"}
          onValueChange={(value) => onTeamChange(value === "all" ? null : value)}
        >
          <SelectTrigger className="h-8 w-[13.5rem] bg-background text-xs">
            <SelectValue placeholder="Team">
              Team: {selectedTeam?.teamName ?? "All teams"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.agentId} value={team.agentId}>
                {team.teamName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={category ?? "all"}
          onValueChange={(value) =>
            onCategoryChange(value === "all" ? null : value)
          }
        >
          <SelectTrigger className="h-8 w-[12.5rem] bg-background text-xs">
            <SelectValue placeholder="Category">
              Category: {category ?? "All categories"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={assignee}
          onValueChange={(value) => onAssigneeChange(value as AssigneeFilter)}
        >
          <SelectTrigger className="h-8 w-[12rem] bg-background text-xs">
            <SelectValue placeholder="Assignee">
              Assignee: {assigneeLabel(assignee)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="everyone">Everyone</SelectItem>
            <SelectItem value="mine">Assigned to me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Select
            value={sort}
            onValueChange={(value) => onSortChange(value as InboxSort)}
          >
            <SelectTrigger className="h-8 w-[11.5rem] bg-background text-xs">
              <SelectValue>
                Sort: {sort === "longest_waiting" ? "Longest waiting" : "Recently updated"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="longest_waiting">Longest waiting</SelectItem>
              <SelectItem value="recent">Recently updated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {filterCount} filter{filterCount === 1 ? "" : "s"} applied
          </span>
          {selectedTeam ? (
            <FilterChip
              label={`Team: ${selectedTeam.teamName}`}
              onRemove={() => onTeamChange(null)}
            />
          ) : null}
          {category ? (
            <FilterChip
              label={`Category: ${category}`}
              onRemove={() => onCategoryChange(null)}
            />
          ) : null}
          {assignee !== "everyone" ? (
            <FilterChip
              label={`Assignee: ${assigneeLabel(assignee)}`}
              onRemove={() => onAssigneeChange("everyone")}
            />
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onClearFilters}
          >
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function assigneeLabel(assignee: AssigneeFilter) {
  if (assignee === "mine") return "Assigned to me";
  if (assignee === "unassigned") return "Unassigned";
  return "Everyone";
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-primary">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-primary/10"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
