import { useMemo, useState } from "react";
import {
  getGetInboxUnreadCountQueryKey,
  getListMessagesQueryKey,
  type InboxEscalation,
  type InboxEscalationStatus,
  type ListInboxEscalationsAssignee,
  useClaimEscalation,
  useGenerateInboxEscalationSummary,
  useGetConversation,
  useListInboxEscalations,
  useListInboxTeams,
  useListMessages,
  useMarkEscalationRead,
  useReplyToEscalation,
  useUpdateInboxEscalation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox as InboxIcon } from "lucide-react";
import {
  countInboxByStatus,
  filterInboxEscalations,
  sortInboxEscalations,
  uniqueInboxCategories,
  type InboxSort,
} from "@/lib/inbox-filters";
import {
  getInboxEscalationsQueryOptions,
  getInboxMessagesQueryOptions,
  getInboxTeamsQueryOptions,
} from "@/lib/escalation-query-options";
import { isActiveInboxStatus, type InboxStatusTab } from "@/lib/inbox-status";
import { toast } from "@/hooks/use-toast";
import { InboxTeamRail } from "@/components/inbox/inbox-team-rail";
import { InboxToolbar } from "@/components/inbox/inbox-toolbar";
import { InboxEscalationTable } from "@/components/inbox/inbox-escalation-table";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<InboxStatusTab>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [assignee, setAssignee] =
    useState<ListInboxEscalationsAssignee>("everyone");
  const [sort, setSort] = useState<InboxSort>("longest_waiting");

  const listParams = {
    status: "all" as const,
    assignee,
    ...(selectedTeamId ? { agentId: selectedTeamId } : {}),
  };
  const { data: escalations = [], isLoading } = useListInboxEscalations(
    listParams,
    { query: getInboxEscalationsQueryOptions(listParams) },
  );
  const { data: teams = [], isLoading: isTeamsLoading } = useListInboxTeams({
    query: getInboxTeamsQueryOptions(),
  });
  const markRead = useMarkEscalationRead();
  const claim = useClaimEscalation();
  const reply = useReplyToEscalation();
  const updateStatus = useUpdateInboxEscalation();
  const generateSummary = useGenerateInboxEscalationSummary();

  const categories = useMemo(
    () => uniqueInboxCategories(escalations),
    [escalations],
  );
  const statusCounts = useMemo(
    () => countInboxByStatus(escalations),
    [escalations],
  );
  const filtered = useMemo(
    () =>
      sortInboxEscalations(
        filterInboxEscalations(escalations, { status, search, category }),
        sort,
      ),
    [escalations, status, search, category, sort],
  );
  const selected =
    escalations.find((item) => item.id === selectedId) ??
    filtered.find((item) => item.id === selectedId) ??
    null;
  const selectedIndex = selected
    ? filtered.findIndex((item) => item.id === selected.id)
    : -1;
  const activeCount = teams.reduce((sum, team) => sum + team.openCount, 0);

  const refreshInbox = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
    void queryClient.invalidateQueries({
      queryKey: getGetInboxUnreadCountQueryKey(),
    });
  };

  const openEscalation = (item: InboxEscalation) => {
    setSelectedId(item.id);
    if (!item.isRead) {
      markRead.mutate(
        { id: item.id },
        {
          onSuccess: () => refreshInbox(),
        },
      );
    }
  };

  const changeStatus = (
    item: InboxEscalation,
    nextStatus: InboxEscalationStatus,
  ) => {
    if (item.status === nextStatus) return;
    updateStatus.mutate(
      { id: item.id, data: { status: nextStatus } },
      {
        onSuccess: () => {
          toast({
            title:
              nextStatus === "resolved"
                ? "Escalation resolved"
                : "Status updated",
          });
          refreshInbox();
        },
        onError: (error) =>
          toast({
            title: "Could not update status",
            description: errorMessage(error, "Try again."),
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <InboxIcon className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight">
              Escalations
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Conversations the AI agent could not resolve
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{activeCount}</span>{" "}
          need a human
        </p>
      </div>

      <div className="flex min-h-0 flex-1">
        <InboxTeamRail
          teams={teams}
          selectedTeamId={selectedTeamId}
          isLoading={isTeamsLoading}
          onSelect={(teamId) => {
            setSelectedTeamId(teamId);
            setSelectedId(null);
          }}
        />

        {selected ? (
          <SelectedWorkspace
            escalation={selected}
            filtered={filtered}
            selectedIndex={selectedIndex}
            isClaiming={claim.isPending}
            isUpdatingStatus={updateStatus.isPending}
            isGeneratingSummary={generateSummary.isPending}
            isSending={reply.isPending}
            onBack={() => setSelectedId(null)}
            onOpen={openEscalation}
            onClaim={() =>
              claim.mutate(
                { id: selected.id },
                {
                  onSuccess: () => {
                    toast({ title: "Escalation assigned to you" });
                    refreshInbox();
                  },
                  onError: (error) =>
                    toast({
                      title: "Could not claim escalation",
                      description: errorMessage(
                        error,
                        "Someone else may have claimed it.",
                      ),
                      variant: "destructive",
                    }),
                },
              )
            }
            onStatusChange={(next) => changeStatus(selected, next)}
            onResolve={() => changeStatus(selected, "resolved")}
            onSend={(content) =>
              reply.mutate(
                { id: selected.id, data: { content } },
                {
                  onSuccess: () => {
                    void queryClient.invalidateQueries({
                      queryKey: getListMessagesQueryKey(selected.conversationId),
                    });
                    refreshInbox();
                  },
                  onError: (error) =>
                    toast({
                      title: "Could not send reply",
                      description: errorMessage(error, "Try again."),
                      variant: "destructive",
                    }),
                },
              )
            }
            onGenerateSummary={() =>
              generateSummary.mutate(
                { id: selected.id },
                {
                  onSuccess: () => {
                    toast({ title: "Summary generated" });
                    refreshInbox();
                  },
                  onError: (error) =>
                    toast({
                      title: "Could not generate summary",
                      description: errorMessage(error, "Try again."),
                      variant: "destructive",
                    }),
                },
              )
            }
          />
        ) : (
          <div className="flex min-w-0 flex-1 flex-col px-6 py-4">
            <InboxToolbar
              status={status}
              statusCounts={statusCounts}
              search={search}
              teams={teams}
              selectedTeamId={selectedTeamId}
              categories={categories}
              category={category}
              assignee={assignee}
              sort={sort}
              onStatusChange={setStatus}
              onSearchChange={setSearch}
              onTeamChange={setSelectedTeamId}
              onCategoryChange={setCategory}
              onAssigneeChange={setAssignee}
              onSortChange={setSort}
              onClearFilters={() => {
                setSelectedTeamId(null);
                setCategory(null);
                setAssignee("everyone");
                setSearch("");
              }}
            />
            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <InboxEscalationTable
                items={filtered}
                isLoading={isLoading}
                visibleCount={filtered.length}
                totalCount={
                  status === "all" ? escalations.length : statusCounts[status]
                }
                onOpen={openEscalation}
                onStatusChange={changeStatus}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectedWorkspace({
  escalation,
  filtered,
  selectedIndex,
  isClaiming,
  isUpdatingStatus,
  isGeneratingSummary,
  isSending,
  onBack,
  onOpen,
  onClaim,
  onStatusChange,
  onResolve,
  onSend,
  onGenerateSummary,
}: {
  escalation: InboxEscalation;
  filtered: InboxEscalation[];
  selectedIndex: number;
  isClaiming: boolean;
  isUpdatingStatus: boolean;
  isGeneratingSummary: boolean;
  isSending: boolean;
  onBack: () => void;
  onOpen: (item: InboxEscalation) => void;
  onClaim: () => void;
  onStatusChange: (status: InboxEscalationStatus) => void;
  onResolve: () => void;
  onSend: (content: string) => void;
  onGenerateSummary: () => void;
}) {
  const { data: messages = [], isLoading } = useListMessages(
    escalation.conversationId,
    {
      query: getInboxMessagesQueryOptions(
        escalation.conversationId,
        isActiveInboxStatus(escalation.status),
      ),
    },
  );
  const { data: conversation } = useGetConversation(escalation.conversationId);

  return (
    <InboxWorkspace
      escalation={escalation}
      messages={messages}
      resolutionStatus={conversation?.status}
      isLoadingMessages={isLoading}
      isSending={isSending}
      isClaiming={isClaiming}
      isUpdatingStatus={isUpdatingStatus}
      isGeneratingSummary={isGeneratingSummary}
      index={Math.max(selectedIndex, 0)}
      total={Math.max(filtered.length, 1)}
      onBack={onBack}
      onPrevious={() => {
        const previous = filtered[selectedIndex - 1];
        if (previous) onOpen(previous);
      }}
      onNext={() => {
        const next = filtered[selectedIndex + 1];
        if (next) onOpen(next);
      }}
      onClaim={onClaim}
      onStatusChange={onStatusChange}
      onResolve={onResolve}
      onSend={onSend}
      onGenerateSummary={onGenerateSummary}
    />
  );
}
