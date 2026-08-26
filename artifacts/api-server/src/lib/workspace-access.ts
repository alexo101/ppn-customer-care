import { count, eq } from "drizzle-orm";
import {
  db,
  workspaceMembersTable,
  type MemberRole,
  type WorkspaceMember,
} from "@workspace/db";
import { normalizeEmail } from "./identity";

export const ALLOWED_EMAIL_DOMAIN = "papernest.com";

export class WorkspaceAccessError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "WorkspaceAccessError";
    this.statusCode = statusCode;
  }
}

export function isPapernestEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 1) return false;
  return normalized.slice(at + 1) === ALLOWED_EMAIL_DOMAIN;
}

export function isMemberRole(value: unknown): value is MemberRole {
  return value === "editor" || value === "viewer";
}

export async function ensureWorkspaceMember(
  userId: string,
  email: string | null | undefined,
): Promise<WorkspaceMember> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new WorkspaceAccessError("Could not determine your email address.");
  }
  if (!isPapernestEmail(normalized)) {
    throw new WorkspaceAccessError(
      "This workspace is only available to papernest.com accounts.",
    );
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(workspaceMembersTable)
      .where(eq(workspaceMembersTable.email, normalized))
      .limit(1);

    if (existing) {
      if (existing.clerkUserId !== userId) {
        const [updated] = await tx
          .update(workspaceMembersTable)
          .set({ clerkUserId: userId })
          .where(eq(workspaceMembersTable.id, existing.id))
          .returning();
        return updated ?? { ...existing, clerkUserId: userId };
      }
      return existing;
    }

    const [anyMember] = await tx
      .select({ id: workspaceMembersTable.id })
      .from(workspaceMembersTable)
      .limit(1);

    if (anyMember) {
      throw new WorkspaceAccessError(
        "You have not been invited to this workspace.",
      );
    }

    const [created] = await tx
      .insert(workspaceMembersTable)
      .values({
        email: normalized,
        clerkUserId: userId,
        role: "editor",
      })
      .returning();

    return created;
  });
}

export async function listMembers(): Promise<WorkspaceMember[]> {
  return db
    .select()
    .from(workspaceMembersTable)
    .orderBy(workspaceMembersTable.createdAt);
}

export async function inviteMember(
  email: string,
  role: MemberRole,
  invitedByEmail: string,
): Promise<WorkspaceMember> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new WorkspaceAccessError("Enter a valid email address.", 400);
  }
  if (!isPapernestEmail(normalized)) {
    throw new WorkspaceAccessError(
      "Invites are limited to papernest.com email addresses.",
      400,
    );
  }

  const [existing] = await db
    .select()
    .from(workspaceMembersTable)
    .where(eq(workspaceMembersTable.email, normalized))
    .limit(1);

  if (existing) {
    throw new WorkspaceAccessError("That person is already on the team.", 400);
  }

  const [created] = await db
    .insert(workspaceMembersTable)
    .values({
      email: normalized,
      role,
      invitedByEmail,
    })
    .returning();

  return created;
}

export async function updateMemberRole(
  id: string,
  role: MemberRole,
): Promise<WorkspaceMember> {
  const [member] = await db
    .select()
    .from(workspaceMembersTable)
    .where(eq(workspaceMembersTable.id, id))
    .limit(1);

  if (!member) {
    throw new WorkspaceAccessError("Team member not found.", 404);
  }

  if (member.role === "editor" && role === "viewer") {
    await assertNotLastEditor();
  }

  const [updated] = await db
    .update(workspaceMembersTable)
    .set({ role })
    .where(eq(workspaceMembersTable.id, id))
    .returning();

  return updated ?? { ...member, role };
}

export async function revokeMember(
  id: string,
  actorEmail: string,
): Promise<void> {
  const [member] = await db
    .select()
    .from(workspaceMembersTable)
    .where(eq(workspaceMembersTable.id, id))
    .limit(1);

  if (!member) {
    throw new WorkspaceAccessError("Team member not found.", 404);
  }

  if (member.email === actorEmail) {
    throw new WorkspaceAccessError("You cannot remove yourself from the team.", 400);
  }

  if (member.role === "editor") {
    await assertNotLastEditor();
  }

  await db.delete(workspaceMembersTable).where(eq(workspaceMembersTable.id, id));
}

export function toMemberDto(member: WorkspaceMember) {
  return {
    id: member.id,
    email: member.email,
    role: member.role as MemberRole,
    status: member.clerkUserId ? ("active" as const) : ("invited" as const),
    invitedByEmail: member.invitedByEmail ?? null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}

async function assertNotLastEditor(): Promise<void> {
  const [result] = await db
    .select({ value: count() })
    .from(workspaceMembersTable)
    .where(eq(workspaceMembersTable.role, "editor"));

  if ((result?.value ?? 0) <= 1) {
    throw new WorkspaceAccessError(
      "The workspace must keep at least one editor.",
      400,
    );
  }
}
