import { getListAgentsQueryKey } from "@workspace/api-client-react";

export function getUserAgentsQueryKey(userId: string | null | undefined) {
  return [...getListAgentsQueryKey(), userId ?? "anonymous"] as const;
}
