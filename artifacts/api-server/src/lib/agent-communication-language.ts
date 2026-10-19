import { getLatestAgentAppearance } from "./agent-appearance-settings";
import { resolveReplyLocale, type ReplyLocale } from "./reply-locale";

export async function getAgentCommunicationLanguage(
  agentId: string | null | undefined,
): Promise<ReplyLocale> {
  if (!agentId) return "en";
  const appearance = await getLatestAgentAppearance(agentId);
  return resolveReplyLocale(appearance?.communicationLanguage);
}
