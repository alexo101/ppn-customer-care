import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
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

  const [created] = await executor
    .insert(agentEscalationSettingsTable)
    .values({ agentId })
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
  const agents = await db.select({ id: agentsTable.id }).from(agentsTable);
  if (agents.length === 0) return 0;

  const existing = await db
    .select({ agentId: agentEscalationSettingsTable.agentId })
    .from(agentEscalationSettingsTable);
  const hasInbox = new Set(existing.map((row) => row.agentId));
  const missing = agents.filter((agent) => !hasInbox.has(agent.id));
  if (missing.length === 0) return 0;

  await db
    .insert(agentEscalationSettingsTable)
    .values(missing.map((agent) => ({ agentId: agent.id })));
  return missing.length;
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
) {
  const rows = await db
    .select({
      escalation: escalationsTable,
      assignment: escalationAssignmentsTable,
      agentName: agentsTable.name,
    })
    .from(escalationAssignmentsTable)
    .innerJoin(
      escalationsTable,
      eq(escalationAssignmentsTable.escalationId, escalationsTable.id),
    )
    .innerJoin(agentsTable, eq(escalationsTable.agentId, agentsTable.id))
    .where(
      and(
        eq(escalationAssignmentsTable.memberId, memberId),
        isNull(escalationAssignmentsTable.revokedAt),
        status === "all" ? undefined : eq(escalationsTable.status, status),
        unreadOnly ? eq(escalationAssignmentsTable.isRead, false) : undefined,
      ),
    )
    .orderBy(desc(escalationsTable.updatedAt));

  return rows.map(({ escalation, assignment, agentName }) =>
    toInboxEscalation(escalation, assignment, agentName),
  );
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
  return row;
}

export async function getAssignedConversation(
  conversationId: string,
  memberId: string,
) {
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
    name: settings?.name ?? "Escalation team",
    notifyAssignedMembers: settings?.notifyAssignedMembers ?? true,
    members: members.map(toMemberDto),
  };
}

function toInboxEscalation(
  escalation: typeof escalationsTable.$inferSelect,
  assignment: typeof escalationAssignmentsTable.$inferSelect,
  agentName: string,
) {
  return {
    id: escalation.id,
    conversationId: escalation.conversationId,
    agentId: escalation.agentId,
    agentName,
    status: escalation.status as "open" | "resolved",
    reason: escalation.reason,
    category: escalation.category,
    subcategory: escalation.subcategory,
    retrievedInformation: Array.isArray(escalation.retrievedInformation)
      ? (escalation.retrievedInformation as Array<Record<string, unknown>>)
      : [],
    previousAnswer: escalation.previousAnswer,
    context: isRecord(escalation.context) ? escalation.context : {},
    isRead: assignment.isRead,
    createdAt: escalation.createdAt.toISOString(),
    updatedAt: escalation.updatedAt.toISOString(),
    resolvedAt: escalation.resolvedAt?.toISOString() ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
