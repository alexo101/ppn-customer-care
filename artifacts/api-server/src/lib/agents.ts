import { and, eq, isNull, or } from "drizzle-orm";
import {
  db,
  agentsTable,
  appearanceSettingsTable,
  apiConnectorsTable,
  audienceTargetsTable,
  conversationsTable,
  intentCategoriesTable,
  knowledgeSourcesTable,
  orchestratorRulesTable,
} from "@workspace/db";
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
  const ownerOrSystem = or(eq(intentCategoriesTable.userId, userId), isNull(intentCategoriesTable.userId));
  const [cat] = await db
    .select({ id: intentCategoriesTable.id })
    .from(intentCategoriesTable)
    .where(and(ownerOrSystem, isNull(intentCategoriesTable.agentId)))
    .limit(1);
  if (cat) return true;

  const [rule] = await db
    .select({ id: orchestratorRulesTable.id })
    .from(orchestratorRulesTable)
    .where(and(or(eq(orchestratorRulesTable.userId, userId), isNull(orchestratorRulesTable.userId)), isNull(orchestratorRulesTable.agentId)))
    .limit(1);
  if (rule) return true;

  const [source] = await db
    .select({ id: knowledgeSourcesTable.id })
    .from(knowledgeSourcesTable)
    .where(and(or(eq(knowledgeSourcesTable.userId, userId), isNull(knowledgeSourcesTable.userId)), isNull(knowledgeSourcesTable.agentId)))
    .limit(1);
  if (source) return true;

  const [connector] = await db
    .select({ id: apiConnectorsTable.id })
    .from(apiConnectorsTable)
    .where(and(or(eq(apiConnectorsTable.userId, userId), isNull(apiConnectorsTable.userId)), isNull(apiConnectorsTable.agentId)))
    .limit(1);
  if (connector) return true;

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
    .update(intentCategoriesTable)
    .set({ agentId })
    .where(and(or(eq(intentCategoriesTable.userId, userId), isNull(intentCategoriesTable.userId)), isNull(intentCategoriesTable.agentId)));
  await db
    .update(orchestratorRulesTable)
    .set({ agentId })
    .where(and(or(eq(orchestratorRulesTable.userId, userId), isNull(orchestratorRulesTable.userId)), isNull(orchestratorRulesTable.agentId)));
  await db
    .update(knowledgeSourcesTable)
    .set({ agentId })
    .where(and(or(eq(knowledgeSourcesTable.userId, userId), isNull(knowledgeSourcesTable.userId)), isNull(knowledgeSourcesTable.agentId)));
  await db
    .update(apiConnectorsTable)
    .set({ agentId })
    .where(and(or(eq(apiConnectorsTable.userId, userId), isNull(apiConnectorsTable.userId)), isNull(apiConnectorsTable.agentId)));
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
    await Promise.all(existing.map((agent) => ensureEveryoneTarget(userId, agent.id)));
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
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}
