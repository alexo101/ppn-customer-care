import { eq } from "drizzle-orm";
import { appearanceSettingsTable, db } from "@workspace/db";
import { resolveReplyLocale, type ReplyLocale } from "./reply-locale";

export async function getAgentCommunicationLanguage(
  agentId: string | null | undefined,
): Promise<ReplyLocale> {
  if (!agentId) return "en";
  const [appearance] = await db
    .select({ language: appearanceSettingsTable.communicationLanguage })
    .from(appearanceSettingsTable)
    .where(eq(appearanceSettingsTable.agentId, agentId))
    .limit(1);
  return resolveReplyLocale(appearance?.language);
}
