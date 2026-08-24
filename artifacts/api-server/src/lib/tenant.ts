import { and, eq } from "drizzle-orm";
import {
  db,
  organizationMembershipsTable,
  organizationsTable,
  teamMembershipsTable,
  teamsTable,
} from "@workspace/db";

export type TenantRole = "owner" | "admin" | "member";

export type TenantContext = {
  organizationId: string;
  teamId: string;
  organizationRole: string;
  teamRole: string;
};

function slugForUser(userId: string): string {
  return `workspace-${Buffer.from(userId).toString("base64url").slice(0, 24).toLowerCase()}`;
}

export async function ensureDefaultTenant(userId: string): Promise<TenantContext> {
  const existing = await getTenantContext(userId);
  if (existing) return existing;

  const [organization] = await db
    .insert(organizationsTable)
    .values({
      name: "Workspace",
      slug: slugForUser(userId),
      createdByUserId: userId,
    })
    .onConflictDoNothing({ target: organizationsTable.slug })
    .returning();

  const org =
    organization ??
    (await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, slugForUser(userId)))
      .limit(1))[0];
  if (!org) throw new Error("Could not initialize organization");

  await db
    .insert(organizationMembershipsTable)
    .values({ organizationId: org.id, userId, role: "owner" })
    .onConflictDoNothing();

  const [team] = await db
    .insert(teamsTable)
    .values({
      organizationId: org.id,
      name: "Default team",
      slug: "default",
      productName: "Support",
    })
    .onConflictDoNothing()
    .returning();
  const selectedTeam =
    team ??
    (await db
      .select()
      .from(teamsTable)
      .where(and(eq(teamsTable.organizationId, org.id), eq(teamsTable.slug, "default")))
      .limit(1))[0];
  if (!selectedTeam) throw new Error("Could not initialize default team");

  await db
    .insert(teamMembershipsTable)
    .values({ teamId: selectedTeam.id, userId, role: "owner" })
    .onConflictDoNothing();

  return {
    organizationId: org.id,
    teamId: selectedTeam.id,
    organizationRole: "owner",
    teamRole: "owner",
  };
}

export async function getTenantContext(
  userId: string,
  requestedTeamId?: string,
): Promise<TenantContext | null> {
  const memberships = await db
    .select({
      organizationId: organizationsTable.id,
      organizationRole: organizationMembershipsTable.role,
      teamId: teamsTable.id,
      teamRole: teamMembershipsTable.role,
    })
    .from(teamMembershipsTable)
    .innerJoin(teamsTable, eq(teamsTable.id, teamMembershipsTable.teamId))
    .innerJoin(
      organizationMembershipsTable,
      and(
        eq(organizationMembershipsTable.organizationId, teamsTable.organizationId),
        eq(organizationMembershipsTable.userId, userId),
      ),
    )
    .innerJoin(organizationsTable, eq(organizationsTable.id, teamsTable.organizationId))
    .where(
      and(
        eq(teamMembershipsTable.userId, userId),
        requestedTeamId ? eq(teamsTable.id, requestedTeamId) : undefined,
      ),
    )
    .limit(1);
  return memberships[0] ?? null;
}

export function canManage(role: string): boolean {
  return role === "owner" || role === "admin";
}
