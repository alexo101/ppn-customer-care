import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
} from "drizzle-orm";
import {
  agentEscalationMembersTable,
  agentEscalationSettingsTable,
  agentsTable,
  conversationsTable,
  db,
  escalationAssignmentsTable,
  escalationsTable,
  messagesTable,
  workspaceMembersTable,
  type AgentEscalationSettings,
  type EscalationAssignment,
} from "@workspace/db";
import { toMemberDto } from "./workspace-access";

type EscalationContext = Record<string, unknown>;

export class EscalationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "EscalationError";
    this.statusCode = statusCode;
  }
}

type EscalationExecutor = Pick<typeof db, "select" | "insert">;

export const DEFAULT_ESCALATION_TEAM_NAME = "Escalation team";

async function agentDisplayName(
  agentId: string,
  executor: EscalationExecutor = db,
) {
  const [agent] = await executor
    .select({ name: agentsTable.name })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .limit(1);
  return agent?.name.trim() || DEFAULT_ESCALATION_TEAM_NAME;
}

function shouldSyncTeamNameWithAgent(
  currentTeamName: string,
  previousAgentName?: string,
) {
  const current = currentTeamName.trim();
  if (!current || current === DEFAULT_ESCALATION_TEAM_NAME) return true;
  const previous = previousAgentName?.trim() ?? "";
  return Boolean(previous) && current === previous;
}

export async function ensureAgentEscalationInbox(
  agentId: string,
  executor: EscalationExecutor = db,
) {
  const [existing] = await executor
    .select()
    .from(agentEscalationSettingsTable)
    .where(eq(agentEscalationSettingsTable.agentId, agentId))
    .limit(1);
  if (existing) return existing;

  const name = await agentDisplayName(agentId, executor);
  const [created] = await executor
    .insert(agentEscalationSettingsTable)
    .values({ agentId, name })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [retry] = await executor
    .select()
    .from(agentEscalationSettingsTable)
    .where(eq(agentEscalationSettingsTable.agentId, agentId))
    .limit(1);
  if (!retry) {
    throw new EscalationError("Could not create escalation inbox.", 500);
  }
  return retry;
}

export async function ensureAgentEscalationInboxesForAllAgents() {
  const agents = await db
    .select({ id: agentsTable.id, name: agentsTable.name })
    .from(agentsTable);
  if (agents.length === 0) return 0;

  const existing = await db
    .select({ agentId: agentEscalationSettingsTable.agentId })
    .from(agentEscalationSettingsTable);
  const hasInbox = new Set(existing.map((row) => row.agentId));
  const missing = agents.filter((agent) => !hasInbox.has(agent.id));
  if (missing.length === 0) return 0;

  await db.insert(agentEscalationSettingsTable).values(
    missing.map((agent) => ({
      agentId: agent.id,
      name: agent.name.trim() || DEFAULT_ESCALATION_TEAM_NAME,
    })),
  );
  return missing.length;
}

export async function syncEscalationTeamNameWithAgent(
  agentId: string,
  nextAgentName: string,
  previousAgentName?: string,
) {
  const nextName = nextAgentName.trim();
  if (!nextName) return;

  const [settings] = await db
    .select()
    .from(agentEscalationSettingsTable)
    .where(eq(agentEscalationSettingsTable.agentId, agentId))
    .limit(1);
  if (!settings) {
    await ensureAgentEscalationInbox(agentId);
    return;
  }
  if (!shouldSyncTeamNameWithAgent(settings.name, previousAgentName)) return;

  await db
    .update(agentEscalationSettingsTable)
    .set({ name: nextName, updatedAt: new Date() })
    .where(eq(agentEscalationSettingsTable.agentId, agentId));
}

export async function getAgentEscalation(agentId: string) {
  const settings = await ensureAgentEscalationInbox(agentId);
  const members = await db
    .select({ member: workspaceMembersTable })
    .from(agentEscalationMembersTable)
    .innerJoin(
      workspaceMembersTable,
      eq(agentEscalationMembersTable.memberId, workspaceMembersTable.id),
    )
    .where(eq(agentEscalationMembersTable.agentId, agentId))
    .orderBy(workspaceMembersTable.email);

  return toAgentEscalation(
    agentId,
    settings,
    members.map((row) => row.member),
  );
}

export async function updateAgentEscalation(
  agentId: string,
  input: {
    name: string;
    notifyAssignedMembers: boolean;
    memberIds: string[];
  },
) {
  const name = input.name.trim();
  const memberIds = [...new Set(input.memberIds)];
  if (!name) throw new EscalationError("Enter an escalation team name.");

  return db.transaction(async (tx) => {
    const members = memberIds.length
      ? await tx
          .select()
          .from(workspaceMembersTable)
          .where(
            and(
              inArray(workspaceMembersTable.id, memberIds),
              isNotNull(workspaceMembersTable.clerkUserId),
            ),
          )
      : [];
    if (members.length !== memberIds.length) {
      throw new EscalationError(
        "Escalation members must be active workspace members.",
      );
    }

    const [settings] = await tx
      .insert(agentEscalationSettingsTable)
      .values({
        agentId,
        name,
        notifyAssignedMembers: input.notifyAssignedMembers,
      })
      .onConflictDoUpdate({
        target: agentEscalationSettingsTable.agentId,
        set: {
          name,
          notifyAssignedMembers: input.notifyAssignedMembers,
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx
      .delete(agentEscalationMembersTable)
      .where(eq(agentEscalationMembersTable.agentId, agentId));
    if (memberIds.length > 0) {
      await tx
        .insert(agentEscalationMembersTable)
        .values(memberIds.map((memberId) => ({ agentId, memberId })));
    }

    const openEscalations = await tx
      .select({ id: escalationsTable.id })
      .from(escalationsTable)
      .where(
        and(
          eq(escalationsTable.agentId, agentId),
          eq(escalationsTable.status, "open"),
        ),
      );
    for (const escalation of openEscalations) {
      await tx
        .update(escalationAssignmentsTable)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(
          memberIds.length > 0
            ? and(
                eq(escalationAssignmentsTable.escalationId, escalation.id),
                notInArray(escalationAssignmentsTable.memberId, memberIds),
              )
            : eq(escalationAssignmentsTable.escalationId, escalation.id),
        );
      if (memberIds.length > 0) {
        await tx
          .insert(escalationAssignmentsTable)
          .values(
            memberIds.map((memberId) => ({
              escalationId: escalation.id,
              memberId,
              isRead: !input.notifyAssignedMembers,
            })),
          )
          .onConflictDoUpdate({
            target: [
              escalationAssignmentsTable.escalationId,
              escalationAssignmentsTable.memberId,
            ],
            set: {
              isRead: !input.notifyAssignedMembers,
              revokedAt: null,
              updatedAt: new Date(),
            },
          });
      }
    }
    await tx
      .update(escalationsTable)
      .set({ assigneeMemberId: null, claimedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(escalationsTable.agentId, agentId),
          eq(escalationsTable.status, "open"),
          memberIds.length > 0
            ? notInArray(escalationsTable.assigneeMemberId, memberIds)
            : undefined,
        ),
      );

    return toAgentEscalation(agentId, settings, members);
  });
}

export async function upsertEscalationForConversation(input: {
  conversationId: string;
  agentId: string | null;
  reason: string;
  category: string;
  subcategory: string;
  retrievedInformation: Array<Record<string, unknown>>;
  previousAnswer: string;
  context: EscalationContext;
}) {
  if (!input.agentId) return null;
  const agentId = input.agentId;

  return db.transaction(async (tx) => {
    const settings = await ensureAgentEscalationInbox(agentId, tx);

    const [existing] = await tx
      .select()
      .from(escalationsTable)
      .where(eq(escalationsTable.conversationId, input.conversationId))
      .limit(1);
    const now = new Date();
    const escalation = existing
      ? (
          await tx
            .update(escalationsTable)
            .set({
              status: "open",
              reason: input.reason,
              category: input.category,
              subcategory: input.subcategory,
              retrievedInformation: input.retrievedInformation,
              previousAnswer: input.previousAnswer,
              context: input.context,
              updatedAt: now,
              resolvedAt: null,
            })
            .where(eq(escalationsTable.id, existing.id))
            .returning()
        )[0]
      : (
          await tx
            .insert(escalationsTable)
            .values({
              conversationId: input.conversationId,
              agentId,
              status: "open",
              reason: input.reason,
              category: input.category,
              subcategory: input.subcategory,
              retrievedInformation: input.retrievedInformation,
              previousAnswer: input.previousAnswer,
              context: input.context,
            })
            .returning()
        )[0];

    const configuredMembers = await tx
      .select({ memberId: agentEscalationMembersTable.memberId })
      .from(agentEscalationMembersTable)
      .where(eq(agentEscalationMembersTable.agentId, agentId));
    const memberIds = configuredMembers.map((member) => member.memberId);

    await tx
      .update(escalationAssignmentsTable)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        memberIds.length > 0
          ? and(
              eq(escalationAssignmentsTable.escalationId, escalation.id),
              notInArray(escalationAssignmentsTable.memberId, memberIds),
            )
          : eq(escalationAssignmentsTable.escalationId, escalation.id),
      );
    if (memberIds.length > 0) {
      await tx
        .insert(escalationAssignmentsTable)
        .values(
          memberIds.map((memberId) => ({
            escalationId: escalation.id,
            memberId,
            isRead: !settings.notifyAssignedMembers,
          })),
        )
        .onConflictDoUpdate({
          target: [
            escalationAssignmentsTable.escalationId,
            escalationAssignmentsTable.memberId,
          ],
          set: {
            isRead: !settings.notifyAssignedMembers,
            revokedAt: null,
            updatedAt: now,
          },
        });
    }

    return escalation;
  });
}

export async function listAssignedEscalations(
  memberId: string,
  status: "open" | "resolved" | "all",
  unreadOnly: boolean,
  agentId?: string,
) {
  const rows = await db
    .select({
      escalation: escalationsTable,
      assignment: escalationAssignmentsTable,
      agentName: agentsTable.name,
      teamName: agentEscalationSettingsTable.name,
    })
    .from(escalationAssignmentsTable)
    .innerJoin(
      escalationsTable,
      eq(escalationAssignmentsTable.escalationId, escalationsTable.id),
    )
    .innerJoin(agentsTable, eq(escalationsTable.agentId, agentsTable.id))
    .innerJoin(
      agentEscalationSettingsTable,
      eq(escalationsTable.agentId, agentEscalationSettingsTable.agentId),
    )
    .where(
      and(
        eq(escalationAssignmentsTable.memberId, memberId),
        isNull(escalationAssignmentsTable.revokedAt),
        status === "all" ? undefined : eq(escalationsTable.status, status),
        unreadOnly ? eq(escalationAssignmentsTable.isRead, false) : undefined,
        agentId ? eq(escalationsTable.agentId, agentId) : undefined,
        or(
          isNull(escalationsTable.assigneeMemberId),
          eq(escalationsTable.assigneeMemberId, memberId),
        ),
      ),
    )
    .orderBy(desc(escalationsTable.updatedAt));

  return enrichInboxEscalations(
    rows.map(({ escalation, assignment, agentName, teamName }) => ({
      escalation,
      assignment,
      agentName,
      teamName,
    })),
  );
}

export async function listTeamEscalations(
  agentId: string,
  memberId: string,
  memberRole: string | undefined,
  status: "open" | "resolved" | "all",
  unreadOnly: boolean,
) {
  const canView = await canViewTeam(agentId, memberId, memberRole);
  if (!canView) throw new EscalationError("Team inbox not found.", 404);

  const rows = await db
    .select({
      escalation: escalationsTable,
      agentName: agentsTable.name,
      teamName: agentEscalationSettingsTable.name,
    })
    .from(escalationsTable)
    .innerJoin(agentsTable, eq(escalationsTable.agentId, agentsTable.id))
    .innerJoin(
      agentEscalationSettingsTable,
      eq(escalationsTable.agentId, agentEscalationSettingsTable.agentId),
    )
    .where(
      and(
        eq(escalationsTable.agentId, agentId),
        status === "all" ? undefined : eq(escalationsTable.status, status),
      ),
    )
    .orderBy(desc(escalationsTable.updatedAt));

  const assignments = rows.length
    ? await db
        .select()
        .from(escalationAssignmentsTable)
        .where(
          and(
            eq(escalationAssignmentsTable.memberId, memberId),
            isNull(escalationAssignmentsTable.revokedAt),
            inArray(
              escalationAssignmentsTable.escalationId,
              rows.map(({ escalation }) => escalation.id),
            ),
          ),
        )
    : [];
  const assignmentByEscalation = new Map(
    assignments.map((assignment) => [assignment.escalationId, assignment]),
  );

  const filteredRows = unreadOnly
    ? rows.filter(
        ({ escalation }) => assignmentByEscalation.get(escalation.id)?.isRead === false,
      )
    : rows;
  return enrichInboxEscalations(
    filteredRows.map(({ escalation, agentName, teamName }) => ({
      escalation,
      assignment: assignmentByEscalation.get(escalation.id) ?? null,
      agentName,
      teamName,
    })),
  );
}

export async function listInboxTeams(
  memberId: string,
  memberRole?: string,
) {
  const teamRows =
    memberRole === "editor"
      ? await db
          .select({
            agentId: agentEscalationSettingsTable.agentId,
            teamName: agentEscalationSettingsTable.name,
            agentName: agentsTable.name,
          })
          .from(agentEscalationSettingsTable)
          .innerJoin(
            agentsTable,
            eq(agentsTable.id, agentEscalationSettingsTable.agentId),
          )
      : await db
          .select({
            agentId: agentEscalationSettingsTable.agentId,
            teamName: agentEscalationSettingsTable.name,
            agentName: agentsTable.name,
          })
          .from(agentEscalationMembersTable)
          .innerJoin(
            agentEscalationSettingsTable,
            eq(
              agentEscalationSettingsTable.agentId,
              agentEscalationMembersTable.agentId,
            ),
          )
          .innerJoin(
            agentsTable,
            eq(agentsTable.id, agentEscalationSettingsTable.agentId),
          )
          .where(eq(agentEscalationMembersTable.memberId, memberId));

  const countRows =
    teamRows.length === 0
      ? []
      : await db
          .select({
            agentId: escalationsTable.agentId,
            openCount: count(),
          })
          .from(escalationAssignmentsTable)
          .innerJoin(
            escalationsTable,
            eq(escalationAssignmentsTable.escalationId, escalationsTable.id),
          )
          .where(
            and(
              eq(escalationAssignmentsTable.memberId, memberId),
              isNull(escalationAssignmentsTable.revokedAt),
              eq(escalationsTable.status, "open"),
              inArray(
                escalationsTable.agentId,
                teamRows.map((team) => team.agentId),
              ),
              or(
                isNull(escalationsTable.assigneeMemberId),
                eq(escalationsTable.assigneeMemberId, memberId),
              ),
            ),
          )
          .groupBy(escalationsTable.agentId);

  const openCountByAgent = new Map(
    countRows.map((row) => [row.agentId, Number(row.openCount)]),
  );
  return teamRows
    .map((team) => ({
      agentId: team.agentId,
      agentName: team.agentName,
      teamName: inboxTeamLabel(team.teamName, team.agentName),
      openCount: openCountByAgent.get(team.agentId) ?? 0,
    }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
}

export function inboxTeamLabel(
  name: string | null | undefined,
  agentName?: string | null,
) {
  const trimmed = name?.trim() ?? "";
  if (trimmed && trimmed !== DEFAULT_ESCALATION_TEAM_NAME) return trimmed;
  const fromAgent = agentName?.trim() ?? "";
  return fromAgent || DEFAULT_ESCALATION_TEAM_NAME;
}

async function canViewTeam(
  agentId: string,
  memberId: string,
  memberRole?: string,
) {
  if (memberRole === "editor") return true;
  const [membership] = await db
    .select({ id: agentEscalationMembersTable.id })
    .from(agentEscalationMembersTable)
    .where(
      and(
        eq(agentEscalationMembersTable.agentId, agentId),
        eq(agentEscalationMembersTable.memberId, memberId),
      ),
    )
    .limit(1);
  return Boolean(membership);
}

export async function claimEscalation(
  escalationId: string,
  memberId: string,
) {
  const [candidate] = await db
    .select({ escalation: escalationsTable })
    .from(escalationsTable)
    .innerJoin(
      agentEscalationMembersTable,
      eq(
        agentEscalationMembersTable.agentId,
        escalationsTable.agentId,
      ),
    )
    .where(
      and(
        eq(escalationsTable.id, escalationId),
        eq(agentEscalationMembersTable.memberId, memberId),
        eq(escalationsTable.status, "open"),
      ),
    )
    .limit(1);
  if (!candidate) throw new EscalationError("Escalation not found.", 404);

  if (candidate.escalation.assigneeMemberId === memberId) {
    return candidate.escalation;
  }
  if (candidate.escalation.assigneeMemberId) {
    throw new EscalationError("This escalation is already assigned.", 409);
  }

  const now = new Date();
  const [claimed] = await db
    .update(escalationsTable)
    .set({ assigneeMemberId: memberId, claimedAt: now, updatedAt: now })
    .where(
      and(
        eq(escalationsTable.id, escalationId),
        eq(escalationsTable.status, "open"),
        isNull(escalationsTable.assigneeMemberId),
      ),
    )
    .returning();
  if (!claimed) {
    throw new EscalationError("This escalation is already assigned.", 409);
  }
  return claimed;
}

export async function getInboxEscalationForMember(
  escalationId: string,
  memberId: string,
) {
  const items = await listAssignedEscalations(memberId, "all", false);
  const item = items.find((escalation) => escalation.id === escalationId);
  if (!item) throw new EscalationError("Escalation not found.", 404);
  return item;
}

export async function countUnreadEscalations(memberId: string) {
  const rows = await db
    .select({ id: escalationAssignmentsTable.id })
    .from(escalationAssignmentsTable)
    .innerJoin(
      escalationsTable,
      eq(escalationAssignmentsTable.escalationId, escalationsTable.id),
    )
    .where(
      and(
        eq(escalationAssignmentsTable.memberId, memberId),
        eq(escalationAssignmentsTable.isRead, false),
        isNull(escalationAssignmentsTable.revokedAt),
        eq(escalationsTable.status, "open"),
        or(
          isNull(escalationsTable.assigneeMemberId),
          eq(escalationsTable.assigneeMemberId, memberId),
        ),
      ),
    );
  return rows.length;
}

export async function markEscalationRead(
  escalationId: string,
  memberId: string,
) {
  const [assignment] = await db
    .update(escalationAssignmentsTable)
    .set({ isRead: true, updatedAt: new Date() })
    .where(
      and(
        eq(escalationAssignmentsTable.escalationId, escalationId),
        eq(escalationAssignmentsTable.memberId, memberId),
        isNull(escalationAssignmentsTable.revokedAt),
      ),
    )
    .returning();
  if (!assignment) throw new EscalationError("Escalation not found.", 404);
  return assignment;
}

export async function markConversationEscalationUnread(conversationId: string) {
  const [escalation] = await db
    .select({ id: escalationsTable.id })
    .from(escalationsTable)
    .where(
      and(
        eq(escalationsTable.conversationId, conversationId),
        eq(escalationsTable.status, "open"),
      ),
    )
    .limit(1);
  if (!escalation) return;
  await db
    .update(escalationAssignmentsTable)
    .set({ isRead: false, updatedAt: new Date() })
    .where(
      and(
        eq(escalationAssignmentsTable.escalationId, escalation.id),
        isNull(escalationAssignmentsTable.revokedAt),
      ),
    );
}

export async function assertAssignedEscalation(
  escalationId: string,
  memberId: string,
) {
  const [row] = await db
    .select({
      escalation: escalationsTable,
      assignment: escalationAssignmentsTable,
    })
    .from(escalationAssignmentsTable)
    .innerJoin(
      escalationsTable,
      eq(escalationAssignmentsTable.escalationId, escalationsTable.id),
    )
    .where(
      and(
        eq(escalationAssignmentsTable.escalationId, escalationId),
        eq(escalationAssignmentsTable.memberId, memberId),
        isNull(escalationAssignmentsTable.revokedAt),
      ),
    )
    .limit(1);
  if (!row) throw new EscalationError("Escalation not found.", 404);
  if (row.escalation.assigneeMemberId !== memberId) {
    throw new EscalationError(
      "Claim this escalation before replying or resolving it.",
      409,
    );
  }
  return row;
}

export async function getAssignedConversation(
  conversationId: string,
  memberId: string,
  memberRole?: string,
) {
  if (memberRole === "editor") {
    const [row] = await db
      .select({ conversation: conversationsTable })
      .from(escalationsTable)
      .innerJoin(
        conversationsTable,
        eq(escalationsTable.conversationId, conversationsTable.id),
      )
      .where(eq(escalationsTable.conversationId, conversationId))
      .limit(1);
    return row?.conversation ?? null;
  }
  const [row] = await db
    .select({ conversation: conversationsTable })
    .from(escalationAssignmentsTable)
    .innerJoin(
      escalationsTable,
      eq(escalationAssignmentsTable.escalationId, escalationsTable.id),
    )
    .innerJoin(
      conversationsTable,
      eq(escalationsTable.conversationId, conversationsTable.id),
    )
    .where(
      and(
        eq(escalationAssignmentsTable.memberId, memberId),
        eq(escalationsTable.conversationId, conversationId),
        isNull(escalationAssignmentsTable.revokedAt),
      ),
    )
    .limit(1);
  return row?.conversation ?? null;
}

export async function resolveAssignedEscalation(
  escalationId: string,
  memberId: string,
) {
  await assertAssignedEscalation(escalationId, memberId);
  const now = new Date();
  const [escalation] = await db
    .update(escalationsTable)
    .set({ status: "resolved", resolvedAt: now, updatedAt: now })
    .where(eq(escalationsTable.id, escalationId))
    .returning();
  if (!escalation) throw new EscalationError("Escalation not found.", 404);
  await db
    .update(escalationAssignmentsTable)
    .set({ isRead: true, updatedAt: now })
    .where(eq(escalationAssignmentsTable.escalationId, escalationId));
  await db
    .update(conversationsTable)
    .set({ status: "resolved", resolvedAt: now, lastActivityAt: now })
    .where(eq(conversationsTable.id, escalation.conversationId));
  return escalation;
}

export async function replyToAssignedEscalation(
  escalationId: string,
  memberId: string,
  content: string,
) {
  const { escalation } = await assertAssignedEscalation(escalationId, memberId);
  if (escalation.status !== "open") {
    throw new EscalationError(
      "This escalation has already been resolved.",
      409,
    );
  }
  const [message] = await db
    .insert(messagesTable)
    .values({
      conversationId: escalation.conversationId,
      sender: "human",
      content: content.trim(),
      metadata: { memberId },
    })
    .returning();
  const now = new Date();
  await db
    .update(escalationsTable)
    .set({ updatedAt: now })
    .where(eq(escalationsTable.id, escalationId));
  await db
    .update(conversationsTable)
    .set({ lastActivityAt: now })
    .where(eq(conversationsTable.id, escalation.conversationId));
  await db
    .update(escalationAssignmentsTable)
    .set({ isRead: false, updatedAt: now })
    .where(
      and(
        eq(escalationAssignmentsTable.escalationId, escalationId),
        isNull(escalationAssignmentsTable.revokedAt),
      ),
    );
  await db
    .update(escalationAssignmentsTable)
    .set({ isRead: true, updatedAt: now })
    .where(
      and(
        eq(escalationAssignmentsTable.escalationId, escalationId),
        eq(escalationAssignmentsTable.memberId, memberId),
      ),
    );
  return message;
}

export function toAssignment(assignment: EscalationAssignment) {
  return {
    id: assignment.id,
    escalationId: assignment.escalationId,
    memberId: assignment.memberId,
    isRead: assignment.isRead,
    revokedAt: assignment.revokedAt?.toISOString() ?? null,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

function toAgentEscalation(
  agentId: string,
  settings: AgentEscalationSettings | undefined,
  members: Array<typeof workspaceMembersTable.$inferSelect>,
) {
  return {
    agentId,
    name: inboxTeamLabel(settings?.name),
    notifyAssignedMembers: settings?.notifyAssignedMembers ?? true,
    members: members.map(toMemberDto),
  };
}

function toInboxEscalation(
  escalation: typeof escalationsTable.$inferSelect,
  assignment: typeof escalationAssignmentsTable.$inferSelect | null,
  agentName: string,
  teamName: string,
  customer: { name: string | null; email: string | null },
  lastMessagePreview: string | null,
  lastActivityAt: Date,
) {
  return {
    id: escalation.id,
    conversationId: escalation.conversationId,
    agentId: escalation.agentId,
    agentName,
    teamName: inboxTeamLabel(teamName, agentName),
    status: escalation.status as "open" | "resolved",
    priority: escalation.priority as "low" | "normal" | "high" | "urgent",
    reason: escalation.reason,
    category: escalation.category,
    subcategory: escalation.subcategory,
    retrievedInformation: Array.isArray(escalation.retrievedInformation)
      ? (escalation.retrievedInformation as Array<Record<string, unknown>>)
      : [],
    previousAnswer: escalation.previousAnswer,
    context: isRecord(escalation.context) ? escalation.context : {},
    isRead: assignment?.isRead ?? false,
    assignmentState: escalation.assigneeMemberId ? "assigned" : "unassigned",
    assigneeMemberId: escalation.assigneeMemberId,
    assigneeName: null,
    claimedAt: escalation.claimedAt?.toISOString() ?? null,
    customerName: customer.name,
    customerEmail: customer.email,
    lastMessagePreview,
    lastActivityAt: lastActivityAt.toISOString(),
    createdAt: escalation.createdAt.toISOString(),
    updatedAt: escalation.updatedAt.toISOString(),
    resolvedAt: escalation.resolvedAt?.toISOString() ?? null,
  };
}

async function enrichInboxEscalations(
  rows: Array<{
    escalation: typeof escalationsTable.$inferSelect;
    assignment: typeof escalationAssignmentsTable.$inferSelect | null;
    agentName: string;
    teamName: string;
  }>,
) {
  if (rows.length === 0) return [];
  const conversationIds = rows.map(({ escalation }) => escalation.conversationId);
  const assigneeIds = rows
    .map(({ escalation }) => escalation.assigneeMemberId)
    .filter((id): id is string => Boolean(id));
  const [messages, members] = await Promise.all([
    db
      .select({
        conversationId: messagesTable.conversationId,
        content: messagesTable.content,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .where(inArray(messagesTable.conversationId, conversationIds))
      .orderBy(desc(messagesTable.createdAt)),
    assigneeIds.length
      ? db
          .select({
            id: workspaceMembersTable.id,
            email: workspaceMembersTable.email,
          })
          .from(workspaceMembersTable)
          .where(inArray(workspaceMembersTable.id, assigneeIds))
      : Promise.resolve([]),
  ]);
  const latestMessage = new Map<string, (typeof messages)[number]>();
  for (const message of messages) {
    if (!latestMessage.has(message.conversationId)) {
      latestMessage.set(message.conversationId, message);
    }
  }
  const memberById = new Map(members.map((member) => [member.id, member.email]));
  return rows.map(
    ({ escalation, assignment, agentName, teamName }) => ({
      ...toInboxEscalation(
        escalation,
        assignment,
        agentName,
        teamName,
        customerFromContext(escalation.context),
        latestMessage.get(escalation.conversationId)?.content ?? null,
        latestMessage.get(escalation.conversationId)?.createdAt ??
          escalation.updatedAt,
      ),
      assigneeName: escalation.assigneeMemberId
        ? memberById.get(escalation.assigneeMemberId) ?? null
        : null,
    }),
  );
}

function customerFromContext(value: unknown) {
  const context = isRecord(value) ? value : {};
  const nameValue =
    context.customerName ??
    context.userName ??
    context.name ??
    ([context.firstName, context.lastName].filter(
      (part): part is string => typeof part === "string" && Boolean(part),
    ).join(" ") || null);
  return {
    name: typeof nameValue === "string" ? nameValue : null,
    email: typeof context.email === "string" ? context.email : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
