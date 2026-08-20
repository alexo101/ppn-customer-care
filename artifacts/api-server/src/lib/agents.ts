import { and, eq, isNull, or } from "drizzle-orm";
import {
  db,
  agentsTable,
  appearanceSettingsTable,
  apiConnectorsTable,
  conversationsTable,
  intentCategoriesTable,
  knowledgeSourcesTable,
  orchestratorRulesTable,
} from "@workspace/db";

export async function getOwnedAgent(userId: string, agentId: string) {
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)))
    .limit(1);
  return agent ?? null;
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
  return created;
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
