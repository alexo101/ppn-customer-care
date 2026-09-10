import {
  getGetAgentEscalationQueryKey,
  getGetInboxUnreadCountQueryKey,
  getListInboxEscalationsQueryKey,
  getListInboxTeamsQueryKey,
  getListMessagesQueryKey,
  getListTeamInboxEscalationsQueryKey,
  type ListInboxEscalationsParams,
  type ListTeamInboxEscalationsParams,
} from "@workspace/api-client-react";

export function getAgentEscalationQueryOptions(agentId: string) {
  return {
    queryKey: getGetAgentEscalationQueryKey(agentId),
    retry: false as const,
  };
}

export function getInboxEscalationsQueryOptions(
  params: ListInboxEscalationsParams = { status: "all" },
) {
  return {
    queryKey: getListInboxEscalationsQueryKey(params),
    refetchInterval: 10000,
    retry: false as const,
  };
}

export function getTeamEscalationsQueryOptions(
  params: ListTeamInboxEscalationsParams,
) {
  return {
    queryKey: getListTeamInboxEscalationsQueryKey(params),
    refetchInterval: 10000,
    retry: false as const,
  };
}

export function getInboxMessagesQueryOptions(
  conversationId: string,
  isOpen: boolean,
) {
  return {
    queryKey: getListMessagesQueryKey(conversationId),
    refetchInterval: isOpen ? 5000 : (false as const),
    retry: false as const,
  };
}

export function getInboxTeamsQueryOptions() {
  return {
    queryKey: getListInboxTeamsQueryKey(),
    refetchInterval: 10000,
    retry: false as const,
  };
}

export function getInboxUnreadCountQueryOptions() {
  return {
    queryKey: getGetInboxUnreadCountQueryKey(),
    refetchInterval: 10000,
    retry: false as const,
  };
}
