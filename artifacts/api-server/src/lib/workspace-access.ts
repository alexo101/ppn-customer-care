import { count, eq } from "drizzle-orm";
import { appendFileSync } from "node:fs";
import {
  db,
  workspaceMembersTable,
  type MemberRole,
  type WorkspaceMember,
} from "@workspace/db";
import { hashDeploymentToken, newDeploymentToken } from "./connection-secrets";
import { normalizeEmail } from "./identity";

export const ALLOWED_EMAIL_DOMAIN = "papernest.com";
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationStatus = "valid" | "expired" | "redeemed" | "invalid";

export type IssuedInvitation = {
  member: WorkspaceMember;
  token: string;
  expiresAt: Date;
  invitePath: string;
};

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

export function invitePathForToken(token: string): string {
  return `/invite/${token}`;
}

function issueInviteToken(now = new Date()) {
  const token = newDeploymentToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  return {
    token,
    tokenHash: hashDeploymentToken(token),
    tokenPrefix: token.slice(0, 8),
    expiresAt,
    invitePath: invitePathForToken(token),
  };
}

export function invitationStatusForMember(
  member: WorkspaceMember | undefined | null,
  now = new Date(),
): InvitationStatus {
  if (!member) return "invalid";
  if (member.inviteRedeemedAt) return "redeemed";
  if (!member.inviteTokenHash) return "invalid";
  if (member.inviteExpiresAt && member.inviteExpiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "valid";
}

async function findMemberByInviteToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) return undefined;
  const [member] = await db
    .select()
    .from(workspaceMembersTable)
    .where(eq(workspaceMembersTable.inviteTokenHash, hashDeploymentToken(trimmed)))
    .limit(1);
  return member;
}

export async function getInvitationStatus(token: string): Promise<{ status: InvitationStatus }> {
  const member = await findMemberByInviteToken(token);
  return { status: invitationStatusForMember(member) };
}

function toIssuedInvitation(
  member: WorkspaceMember,
  issued: { token: string; expiresAt: Date; invitePath: string },
): IssuedInvitation {
  return {
    member,
    token: issued.token,
    expiresAt: issued.expiresAt,
    invitePath: issued.invitePath,
  };
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
): Promise<IssuedInvitation> {
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

  const issued = issueInviteToken();
  const [created] = await db
    .insert(workspaceMembersTable)
    .values({
      email: normalized,
      role,
      invitedByEmail,
      inviteTokenHash: issued.tokenHash,
      inviteTokenPrefix: issued.tokenPrefix,
      inviteExpiresAt: issued.expiresAt,
    })
    .returning();

  return toIssuedInvitation(created, issued);
}

export async function regenerateInviteToken(id: string): Promise<IssuedInvitation> {
  const [member] = await db
    .select()
    .from(workspaceMembersTable)
    .where(eq(workspaceMembersTable.id, id))
    .limit(1);

  // #region agent log
  { const _p={sessionId:'e273e6',runId:'post-fix',hypothesisId:'C',location:'workspace-access.ts:regenerateInviteToken',message:'member lookup',data:{id,found:Boolean(member),hasClerkUserId:Boolean(member?.clerkUserId),hasHash:Boolean(member?.inviteTokenHash)},timestamp:Date.now()}; try{appendFileSync('/home/runner/workspace/.cursor/debug-e273e6.log',JSON.stringify(_p)+'\n');}catch{} fetch('http://127.0.0.1:7600/ingest/a2a2da46-8d04-4e69-ad9d-61a4005dfe74',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e273e6'},body:JSON.stringify(_p)}).catch(()=>{}); }
  // #endregion
  if (!member) {
    throw new WorkspaceAccessError("Team member not found.", 404);
  }
  if (member.clerkUserId) {
    throw new WorkspaceAccessError("This person already joined the workspace.", 400);
  }

  const issued = issueInviteToken();
  const [updated] = await db
    .update(workspaceMembersTable)
    .set({
      inviteTokenHash: issued.tokenHash,
      inviteTokenPrefix: issued.tokenPrefix,
      inviteExpiresAt: issued.expiresAt,
      inviteRedeemedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceMembersTable.id, id))
    .returning();

  return toIssuedInvitation(updated ?? member, issued);
}

export async function redeemInvitation(
  token: string,
  userId: string,
  email: string | null | undefined,
): Promise<WorkspaceMember> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new WorkspaceAccessError("Could not determine your email address.", 400);
  }

  const member = await findMemberByInviteToken(token);
  const status = invitationStatusForMember(member);
  if (!member || status === "invalid") {
    throw new WorkspaceAccessError("This invite link is not valid.", 400);
  }
  if (status === "expired") {
    throw new WorkspaceAccessError("This invite link has expired. Ask for a new one.", 400);
  }
  if (status === "redeemed") {
    throw new WorkspaceAccessError("This invite has already been used.", 400);
  }
  if (member.email !== normalized) {
    throw new WorkspaceAccessError(
      "Sign in with the Google account that was invited.",
      403,
    );
  }

  const redeemedAt = new Date();
  const [updated] = await db
    .update(workspaceMembersTable)
    .set({
      clerkUserId: userId,
      inviteRedeemedAt: redeemedAt,
      inviteTokenHash: null,
      inviteTokenPrefix: null,
      updatedAt: redeemedAt,
    })
    .where(eq(workspaceMembersTable.id, member.id))
    .returning();

  return updated ?? {
    ...member,
    clerkUserId: userId,
    inviteRedeemedAt: redeemedAt,
    inviteTokenHash: null,
  };
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

export function toInviteDto(issued: IssuedInvitation) {
  return {
    ...toMemberDto(issued.member),
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    invitePath: issued.invitePath,
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
