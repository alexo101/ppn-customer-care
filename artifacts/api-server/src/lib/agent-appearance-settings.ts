import { desc, eq } from "drizzle-orm";
import { appearanceSettingsTable, db } from "@workspace/db";

export async function getLatestAgentAppearance(agentId: string) {
  const [appearance] = await db
    .select()
    .from(appearanceSettingsTable)
    .where(eq(appearanceSettingsTable.agentId, agentId))
    .orderBy(
      desc(appearanceSettingsTable.updatedAt),
      desc(appearanceSettingsTable.createdAt),
      desc(appearanceSettingsTable.id),
    )
    .limit(1);
  return appearance ?? null;
}
