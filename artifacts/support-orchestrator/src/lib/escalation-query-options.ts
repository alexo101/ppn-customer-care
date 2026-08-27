import {
  getGetAgentEscalationQueryKey,
  getGetInboxUnreadCountQueryKey,
  getListInboxEscalationsQueryKey,
} from "@workspace/api-client-react";

export function getAgentEscalationQueryOptions(agentId: string) {
  return {
    queryKey: getGetAgentEscalationQueryKey(agentId),
    retry: false as const,
  };
}

export function getInboxEscalationsQueryOptions(
  status: "open" | "resolved" | "all",
) {
  return {
    queryKey: getListInboxEscalationsQueryKey({ status }),
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