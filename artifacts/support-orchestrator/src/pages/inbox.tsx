import { useEffect, useMemo, useState } from "react";
import {
  getGetAgentEscalationQueryOptions,
  getGetInboxUnreadCountQueryKey,
  getListMessagesQueryKey,
  type InboxEscalation,
  useGetConversation,
  useClaimEscalation,
  useListInboxEscalations,
  useListAgents,
  useListTeamInboxEscalations,
  useListMessages,
  useMarkEscalationRead,
  useReplyToEscalation,
  useResolveEscalation,
} from "@workspace/api-client-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  Inbox as InboxIcon,
  Loader2,
  Send,
  Users,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getInboxEscalationsQueryOptions,
  getInboxMessagesQueryOptions,
  getTeamEscalationsQueryOptions,
} from "@/lib/escalation-query-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { inboxTeamsFromConfigured } from "@/lib/inbox-teams";
import { toast } from "@/hooks/use-toast";

type StatusFilter = "open" | "resolved" | "all";

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"mine" | "team">("mine");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const { data: escalations = [], isLoading } = useListInboxEscalations(
    { status: statusFilter },
    {
      query: getInboxEscalationsQueryOptions(statusFilter),
    },
  );
  const { data: teamEscalations = [], isLoading: isTeamLoading } =
    useListTeamInboxEscalations(
      { agentId: selectedTeamId ?? "", status: statusFilter },
      {
        query: {
          ...getTeamEscalationsQueryOptions(
            selectedTeamId ?? "",
            statusFilter,
          ),
          enabled: viewMode === "team" && Boolean(selectedTeamId),
        },
      },
    );
  const { data: agents = [] } = useListAgents();
  const escalationSettings = useQueries({
    queries: agents.map((agent) => getGetAgentEscalationQueryOptions(agent.id)),
  });
  const markRead = useMarkEscalationRead();

  const teams = useMemo(
    () =>
      inboxTeamsFromConfigured(
        agents.map((agent, index) => ({
          agentId: agent.id,
          teamName: escalationSettings[index]?.data?.name ?? "",
          agentName: agent.name,
          openCount: escalations.filter(
            (item) => item.agentId === agent.id && item.status === "open",
          ).length,
        })),
      ),
    [agents, escalationSettings, escalations],
  );

  const sourceItems =
    viewMode === "team"
      ? teamEscalations
      : selectedTeamId
        ? escalations.filter((item) => item.agentId === selectedTeamId)
        : escalations;
  const filtered = useMemo(
    () =>
      sourceItems.filter((escalation) => {
        const value =
          `${escalation.teamName} ${escalation.agentName} ${escalation.customerName ?? ""} ${escalation.customerEmail ?? ""} ${escalation.lastMessagePreview ?? ""} ${escalation.category} ${escalation.subcategory} ${escalation.reason}`.toLowerCase();
        return value.includes(search.toLowerCase());
      }),
    [sourceItems, search],
  );

  useEffect(() => {
    if (!selectedId || !filtered.some((item) => item.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const selected = sourceItems.find((item) => item.id === selectedId) ?? null;
  const openEscalation = (item: InboxEscalation) => {
    setSelectedId(item.id);
    if (!item.isRead) {
      markRead.mutate(
        { id: item.id },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({
              queryKey: ["/api/inbox"],
            });
            void queryClient.invalidateQueries({
              queryKey: getGetInboxUnreadCountQueryKey(),
            });
          },
        },
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <InboxIcon className="h-5 w-5 shrink-0 text-primary" />
          <h1 className="shrink-0 text-xl font-semibold tracking-tight">Inbox</h1>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search escalations..."
            className="h-9 max-w-sm bg-background text-xs"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
            {(["open", "all", "resolved"] as StatusFilter[]).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs capitalize"
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
            <Button
              variant={viewMode === "mine" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewMode("mine")}
            >
              My inbox
            </Button>
            <Button
              variant={viewMode === "team" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setViewMode("team");
                setSelectedTeamId(selectedTeamId ?? teams[0]?.agentId ?? null);
              }}
            >
              <Users className="h-3.5 w-3.5" />
              All team conversations
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
          <div className="border-b border-border p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Escalation teams
            </p>
            <div className="mt-2 space-y-1">
              {teams.map((team) => (
                <button
                  key={team.agentId}
                  type="button"
                  onClick={() => {
                    setSelectedTeamId(team.agentId);
                    if (viewMode === "team") setSelectedId(null);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs",
                    viewMode === "team" && selectedTeamId === team.agentId
                      ? "bg-primary/10 text-primary"
                      : selectedTeamId === team.agentId
                        ? "bg-muted"
                        : "hover:bg-background",
                  )}
                >
                  <span className="truncate font-medium">{team.teamName}</span>
                  <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                    {team.openCount}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1 p-2">
              {(viewMode === "mine" ? isLoading : isTeamLoading) ? (
                <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading inbox...
                </div>
              ) : filtered.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No {statusFilter === "all" ? "" : statusFilter}{" "}
                  {viewMode === "team" ? "team" : "personal"} escalations.
                </p>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openEscalation(item)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors",
                      selectedId === item.id
                        ? "border-primary/30 bg-primary/5"
                        : "border-transparent hover:border-border hover:bg-background",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {item.teamName}
                      </span>
                      {!item.isRead && item.status === "open" ? (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-primary"
                          aria-label="Unread"
                        />
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      {item.agentName}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold">
                      {item.customerName || item.customerEmail || "Customer"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs">
                      {item.lastMessagePreview || item.reason || "Support request"}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      {item.category || "Support"}{" "}
                      {item.subcategory ? `· ${item.subcategory}` : ""} ·{" "}
                      {item.priority}
                    </p>
                    <p className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{item.assigneeName || "Unassigned"}</span>
                      <span>
                        {formatDistanceToNow(new Date(item.lastActivityAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {selected ? (
          <EscalationDetail
            escalation={selected}
            isTeamView={viewMode === "team"}
            onRefresh={() => {
              void queryClient.invalidateQueries({
                queryKey: ["/api/inbox"],
              });
              void queryClient.invalidateQueries({
                queryKey: getGetInboxUnreadCountQueryKey(),
              });
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <InboxIcon className="h-10 w-10 opacity-20" />
            <p className="text-sm">
              Select an escalation to view the conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function EscalationDetail({
  escalation,
  isTeamView,
  onRefresh,
}: {
  escalation: InboxEscalation;
  isTeamView: boolean;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: conversation } = useGetConversation(escalation.conversationId);
  const { data: messages = [], isLoading } = useListMessages(
    escalation.conversationId,
    { query: getInboxMessagesQueryOptions(
      escalation.conversationId,
      escalation.status === "open",
    ) },
  );
  const reply = useReplyToEscalation();
  const resolve = useResolveEscalation();
  const claim = useClaimEscalation();
  const [content, setContent] = useState("");
  const canRespond = escalation.assigneeMemberId !== null;

  const claimConversation = () => {
    claim.mutate(
      { id: escalation.id },
      {
        onSuccess: () => {
          toast({ title: "Escalation assigned to you" });
          onRefresh();
        },
        onError: (error) =>
          toast({
            title: "Could not claim escalation",
            description:
              error instanceof Error
                ? error.message
                : "Someone else may have claimed it.",
            variant: "destructive",
          }),
      },
    );
  };

  const sendReply = () => {
    if (
      !content.trim() ||
      reply.isPending ||
      escalation.status !== "open" ||
      !canRespond
    )
      return;
    reply.mutate(
      { id: escalation.id, data: { content: content.trim() } },
      {
        onSuccess: () => {
          setContent("");
          void queryClient.invalidateQueries({
            queryKey: getListMessagesQueryKey(escalation.conversationId),
          });
          onRefresh();
        },
        onError: (error) =>
          toast({
            title: "Could not send reply",
            description: error instanceof Error ? error.message : "Try again.",
            variant: "destructive",
          }),
      },
    );
  };

  const resolveConversation = () => {
    resolve.mutate(
      { id: escalation.id },
      {
        onSuccess: () => {
          toast({ title: "Escalation resolved" });
          onRefresh();
        },
        onError: (error) =>
          toast({
            title: "Could not resolve escalation",
            description: error instanceof Error ? error.message : "Try again.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold">
              {escalation.teamName}
            </h2>
            <Badge
              variant={
                escalation.status === "open" ? "destructive" : "secondary"
              }
              className="capitalize"
            >
              {escalation.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isTeamView ? "Team queue · " : "My inbox · "}
            {escalation.agentName} ·{" "}
            {escalation.customerName || escalation.customerEmail || "Customer"}{" "}
            · Conversation{" "}
            {escalation.conversationId.slice(0, 8)}
          </p>
        </div>
        {escalation.status === "open" ? (
          <div className="flex items-center gap-2">
            {escalation.assigneeMemberId === null ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={claimConversation}
                disabled={claim.isPending}
              >
                {claim.isPending ? "Assigning..." : "Assign to me"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={resolveConversation}
              disabled={resolve.isPending || !canRespond}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {resolve.isPending ? "Resolving..." : "Resolve"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading conversation...
              </p>
            ) : (
              messages.map((message) => {
                const human = message.sender === "human";
                const user = message.sender === "user";
                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      user ? "justify-end" : "justify-start",
                    )}
                  >
                    {!user ? (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                        {human ? (
                          <UserRound className="h-4 w-4" />
                        ) : (
                          <InboxIcon className="h-4 w-4" />
                        )}
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[78%]",
                        user ? "items-end" : "items-start",
                      )}
                    >
                      <div className="mb-1 text-[10px] text-muted-foreground">
                        {human ? "Support member" : user ? "User" : "Fin"}
                      </div>
                      <div
                        className={cn(
                          "rounded-lg border p-3 text-sm whitespace-pre-wrap",
                          user
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card",
                        )}
                      >
                        {message.content}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {conversation?.status === "escalated" &&
            escalation.status === "open" ? (
              <p className="text-center text-xs text-muted-foreground">
                Human support has taken over this conversation.
              </p>
            ) : null}
          </div>

          <aside className="h-fit rounded-xl border border-border bg-card p-4 text-sm">
            <h3 className="font-semibold">Escalation context</h3>
            <Separator className="my-3" />
            <ContextRow label="Why Fin escalated" value={escalation.reason} />
            <ContextRow
              label="Customer"
              value={escalation.customerName || escalation.customerEmail || "—"}
            />
            <ContextRow label="Category" value={escalation.category || "—"} />
            <ContextRow
              label="Subcategory"
              value={escalation.subcategory || "—"}
            />
            <ContextRow
              label="User question"
              value={stringValue(escalation.context.userQuestion) || "—"}
            />
            {escalation.previousAnswer ? (
              <ContextRow label="AI response" value={escalation.previousAnswer} />
            ) : null}
            {Object.entries(escalation.context)
              .filter(
                ([key]) => !["userQuestion", "userId", "email"].includes(key),
              )
              .map(([key, value]) => (
                <ContextRow
                  key={key}
                  label={key}
                  value={stringValue(value) || "—"}
                />
              ))}
            {escalation.retrievedInformation.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  Information already retrieved
                </p>
                <div className="mt-2 space-y-2">
                  {escalation.retrievedInformation.map((item, index) => (
                    <div
                      key={`${item.sourceId ?? index}`}
                      className="rounded-md bg-muted/50 p-2 text-xs"
                    >
                      <p className="font-medium">
                        {stringValue(item.sourceName) || "Source"}
                      </p>
                      <p className="mt-1 line-clamp-4 text-muted-foreground">
                        {stringValue(item.excerpt) ||
                          "Retrieved data available."}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      {escalation.status === "open" ? (
        <div className="shrink-0 border-t border-border bg-card p-4">
          <div className="mx-auto flex max-w-4xl gap-2">
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={
                canRespond
                  ? "Reply to the user as a support member..."
                  : "Assign this escalation to yourself before replying..."
              }
              className="min-h-11 resize-none text-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  sendReply();
                }
              }}
            />
            <Button
              size="icon"
              className="mt-auto shrink-0"
              onClick={sendReply}
              disabled={!content.trim() || reply.isPending || !canRespond}
              aria-label="Send reply"
            >
              {reply.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mx-auto mt-1 max-w-4xl text-[10px] text-muted-foreground">
            Ctrl/Cmd + Enter to send
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-xs">{value}</p>
    </div>
  );
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
