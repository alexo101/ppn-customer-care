import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  agentsTable,
  appearanceSettingsTable,
  audienceTargetsTable,
  conversationsTable,
} from "@workspace/db";
import { ensureAgentEscalationInbox } from "./escalations";
import { ensureAgentConversationSettings } from "./conversation-settings";
import { EVERYONE_TARGET_DESCRIPTION, EVERYONE_TARGET_NAME } from "./targets";

export async function getAgent(agentId: string) {
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .limit(1);
  return agent ?? null;
}

/** @deprecated Prefer getAgent — ownership is company-wide for signed-in users. */
export async function getOwnedAgent(_userId: string, agentId: string, _teamId?: string) {
  return getAgent(agentId);
}

async function hasUnscopedRows(userId: string) {
  const [convo] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.userId, userId), isNull(conversationsTable.agentId)))
    .limit(1);
  if (convo) return true;

  const [appearance] = await db
    .select({ id: appearanceSettingsTable.id })
    .from(appearanceSettingsTable)
    .where(and(eq(appearanceSettingsTable.userId, userId), isNull(appearanceSettingsTable.agentId)))
    .limit(1);
  return Boolean(appearance);
}

async function attachUnscopedRows(userId: string, agentId: string) {
  await db
    .update(conversationsTable)
    .set({ agentId })
    .where(and(eq(conversationsTable.userId, userId), isNull(conversationsTable.agentId)));
  await db
    .update(appearanceSettingsTable)
    .set({ agentId })
    .where(and(eq(appearanceSettingsTable.userId, userId), isNull(appearanceSettingsTable.agentId)));
}

export async function ensureDefaultAgentIfNeeded(userId: string) {
  const existing = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.userId, userId))
    .orderBy(agentsTable.createdAt);

  if (existing[0]) {
    await attachUnscopedRows(userId, existing[0].id);
    await Promise.all(
      existing.map((agent) =>
        Promise.all([
          ensureEveryoneTarget(userId, agent.id),
          ensureAgentEscalationInbox(agent.id),
          ensureAgentConversationSettings(agent.id),
        ]),
      ),
    );
    return existing[0];
  }

  if (!(await hasUnscopedRows(userId))) return null;

  const [created] = await db
    .insert(agentsTable)
    .values({
      userId,
      name: "Default agent",
      description: "Migrated from previous global configuration",
    })
    .returning();

  await attachUnscopedRows(userId, created.id);
  await ensureEveryoneTarget(userId, created.id);
  await ensureAgentEscalationInbox(created.id);
  await ensureAgentConversationSettings(created.id);
  return created;
}

export async function ensureEveryoneTarget(userId: string, agentId: string) {
  const [existing] = await db
    .select({ id: audienceTargetsTable.id })
    .from(audienceTargetsTable)
    .where(
      and(
        eq(audienceTargetsTable.agentId, agentId),
        eq(audienceTargetsTable.name, EVERYONE_TARGET_NAME),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(audienceTargetsTable)
    .values({
      userId,
      agentId,
      name: EVERYONE_TARGET_NAME,
      description: EVERYONE_TARGET_DESCRIPTION,
      matchMode: "all",
      isEnabled: true,
    })
    .returning({ id: audienceTargetsTable.id });

  return created.id;
}

export async function ensureEveryoneTargetsForAllAgents() {
  const agents = await db
    .select({ id: agentsTable.id, userId: agentsTable.userId })
    .from(agentsTable);

  if (agents.length === 0) return 0;

  const existing = await db
    .select({ agentId: audienceTargetsTable.agentId })
    .from(audienceTargetsTable)
    .where(eq(audienceTargetsTable.name, EVERYONE_TARGET_NAME));

  const hasEveryone = new Set(
    existing.map((row) => row.agentId).filter((id): id is string => Boolean(id)),
  );
  const missing = agents.filter((agent) => !hasEveryone.has(agent.id));
  if (missing.length === 0) return 0;

  await db.insert(audienceTargetsTable).values(
    missing.map((agent) => ({
      userId: agent.userId,
      agentId: agent.id,
      name: EVERYONE_TARGET_NAME,
      description: EVERYONE_TARGET_DESCRIPTION,
      matchMode: "all",
      isEnabled: true,
    })),
  );

  return missing.length;
}

export function toAgent(row: typeof agentsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isEnabled: row.isEnabled,
    trustedDomains: row.trustedDomains ?? [],
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}
