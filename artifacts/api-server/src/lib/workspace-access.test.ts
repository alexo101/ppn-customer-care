import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashDeploymentToken } from "./connection-secrets";

type QueryResult = unknown;

function createQuery(result: QueryResult) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = vi.fn(self);
  chain.where = vi.fn(self);
  chain.limit = vi.fn(() => promise);
  chain.orderBy = vi.fn(() => promise);
  chain.returning = vi.fn(() => promise);
  chain.values = vi.fn(self);
  chain.set = vi.fn(self);
  chain.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    promise.then(onFulfilled, onRejected);
  return chain;
}

const { transaction, select, insert, update, del } = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    transaction,
    select,
    insert,
    update,
    delete: del,
  },
  workspaceMembersTable: {
    id: "id",
    email: "email",
    clerkUserId: "clerk_user_id",
    role: "role",
    invitedByEmail: "invited_by_email",
    inviteTokenHash: "invite_token_hash",
    inviteTokenPrefix: "invite_token_prefix",
    inviteExpiresAt: "invite_expires_at",
    inviteRedeemedAt: "invite_redeemed_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

import {
  INVITE_TTL_MS,
  WorkspaceAccessError,
  ensureWorkspaceMember,
  getInvitationStatus,
  invitationStatusForMember,
  inviteMember,
  isPapernestEmail,
  redeemInvitation,
  regenerateInviteToken,
  revokeMember,
  updateMemberRole,
} from "./workspace-access";

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: "member-1",
    email: "ada@papernest.com",
    clerkUserId: "user_1",
    role: "editor",
    invitedByEmail: null,
    inviteTokenHash: null,
    inviteTokenPrefix: null,
    inviteExpiresAt: null,
    inviteRedeemedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("isPapernestEmail", () => {
  it("accepts exact papernest.com addresses", () => {
    expect(isPapernestEmail("ada@papernest.com")).toBe(true);
    expect(isPapernestEmail(" Ada@Papernest.com ")).toBe(true);
  });

  it("rejects other domains and subdomains", () => {
    expect(isPapernestEmail("ada@gmail.com")).toBe(false);
    expect(isPapernestEmail("ada@team.papernest.com")).toBe(false);
    expect(isPapernestEmail("not-an-email")).toBe(false);
  });
});

describe("ensureWorkspaceMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing and non-papernest emails", async () => {
    await expect(ensureWorkspaceMember("user_1", null)).rejects.toMatchObject({
      statusCode: 403,
      message: "Could not determine your email address.",
    });
    await expect(ensureWorkspaceMember("user_1", "ada@gmail.com")).rejects.toMatchObject({
      statusCode: 403,
      message: "This workspace is only available to papernest.com accounts.",
    });
  });

  it("returns an existing invited member and stamps clerkUserId", async () => {
    const invited = member({ clerkUserId: null });
    const stamped = member();
    transaction.mockImplementation(async (fn: (tx: { select: typeof select; insert: typeof insert; update: typeof update }) => Promise<unknown>) => {
      select.mockReturnValueOnce(createQuery([invited]));
      update.mockReturnValueOnce(createQuery([stamped]));
      return fn({ select, insert, update });
    });

    await expect(ensureWorkspaceMember("user_1", "ada@papernest.com")).resolves.toEqual(stamped);
    expect(update).toHaveBeenCalled();
  });

  it("bootstraps the first papernest.com user as an editor", async () => {
    const created = member();
    transaction.mockImplementation(async (fn: (tx: { select: typeof select; insert: typeof insert; update: typeof update }) => Promise<unknown>) => {
      select
        .mockReturnValueOnce(createQuery([]))
        .mockReturnValueOnce(createQuery([]));
      insert.mockReturnValueOnce(createQuery([created]));
      return fn({ select, insert, update });
    });

    await expect(ensureWorkspaceMember("user_1", "ada@papernest.com")).resolves.toEqual(created);
    expect(insert).toHaveBeenCalled();
  });

  it("rejects a papernest.com user who is not invited after bootstrap", async () => {
    transaction.mockImplementation(async (fn: (tx: { select: typeof select; insert: typeof insert; update: typeof update }) => Promise<unknown>) => {
      select
        .mockReturnValueOnce(createQuery([]))
        .mockReturnValueOnce(createQuery([{ id: "other" }]));
      return fn({ select, insert, update });
    });

    await expect(ensureWorkspaceMember("user_2", "lee@papernest.com")).rejects.toBeInstanceOf(
      WorkspaceAccessError,
    );
    await expect(ensureWorkspaceMember("user_2", "lee@papernest.com")).rejects.toMatchObject({
      message: "You have not been invited to this workspace.",
    });
  });
});

describe("inviteMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-papernest emails", async () => {
    await expect(inviteMember("ada@gmail.com", "viewer", "owner@papernest.com")).rejects.toMatchObject({
      statusCode: 400,
      message: "Invites are limited to papernest.com email addresses.",
    });
  });

  it("rejects an email that is already on the team", async () => {
    select.mockReturnValueOnce(createQuery([member()]));
    await expect(inviteMember("ada@papernest.com", "viewer", "owner@papernest.com")).rejects.toMatchObject({
      statusCode: 400,
      message: "That person is already on the team.",
    });
  });

  it("stores a hash of a 7-day token and returns the raw token once", async () => {
    const created = member({
      clerkUserId: null,
      role: "viewer",
      invitedByEmail: "owner@papernest.com",
    });
    const insertQuery = createQuery([created]);
    select.mockReturnValueOnce(createQuery([]));
    insert.mockReturnValueOnce(insertQuery);

    const before = Date.now();
    const issued = await inviteMember("ada@papernest.com", "viewer", "owner@papernest.com");
    const after = Date.now();

    expect(issued.token).toEqual(expect.any(String));
    expect(issued.token.length).toBeGreaterThan(20);
    expect(issued.invitePath).toBe(`/invite/${issued.token}`);
    expect(issued.expiresAt.getTime()).toBeGreaterThanOrEqual(before + INVITE_TTL_MS);
    expect(issued.expiresAt.getTime()).toBeLessThanOrEqual(after + INVITE_TTL_MS);

    const stored = (insertQuery.values as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(stored.inviteTokenHash).toBe(hashDeploymentToken(issued.token));
    expect(stored.inviteTokenHash).not.toBe(issued.token);
    expect(stored.inviteTokenPrefix).toBe(issued.token.slice(0, 8));
    expect(stored.inviteExpiresAt).toEqual(issued.expiresAt);
  });
});

describe("invitation tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies missing, expired, redeemed, and valid invites", () => {
    expect(invitationStatusForMember(undefined)).toBe("invalid");
    expect(invitationStatusForMember(member({ inviteTokenHash: null }))).toBe("invalid");
    expect(
      invitationStatusForMember(
        member({
          inviteTokenHash: "hash",
          inviteRedeemedAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
      ),
    ).toBe("redeemed");
    expect(
      invitationStatusForMember(
        member({
          clerkUserId: null,
          inviteTokenHash: "hash",
          inviteExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).toBe("expired");
    expect(
      invitationStatusForMember(
        member({
          clerkUserId: null,
          inviteTokenHash: "hash",
          inviteExpiresAt: new Date("2026-01-08T00:00:00.000Z"),
        }),
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).toBe("valid");
  });

  it("treats unknown tokens as invalid", async () => {
    await expect(getInvitationStatus("")).resolves.toEqual({ status: "invalid" });
    select.mockReturnValueOnce(createQuery([]));
    await expect(getInvitationStatus("missing-token")).resolves.toEqual({ status: "invalid" });
  });

  it("replaces the previous hash when regenerating", async () => {
    const invited = member({
      clerkUserId: null,
      inviteTokenHash: "old-hash",
      inviteTokenPrefix: "oldprefx",
      inviteExpiresAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    const updateQuery = createQuery([invited]);
    select.mockReturnValueOnce(createQuery([invited]));
    update.mockReturnValueOnce(updateQuery);

    const issued = await regenerateInviteToken("member-1");
    const stored = (updateQuery.set as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;

    expect(issued.token).toEqual(expect.any(String));
    expect(stored.inviteTokenHash).toBe(hashDeploymentToken(issued.token));
    expect(stored.inviteTokenHash).not.toBe("old-hash");
    expect(stored.inviteRedeemedAt).toBeNull();
  });

  it("does not regenerate for someone who already joined", async () => {
    select.mockReturnValueOnce(createQuery([member({ clerkUserId: "user_1" })]));
    await expect(regenerateInviteToken("member-1")).rejects.toMatchObject({
      statusCode: 400,
      message: "This person already joined the workspace.",
    });
  });

  it("returns not found when regenerating a missing member", async () => {
    select.mockReturnValueOnce(createQuery([]));
    await expect(regenerateInviteToken("missing")).rejects.toMatchObject({
      statusCode: 404,
      message: "Team member not found.",
    });
  });

  it("redeems a valid token for the invited Google account", async () => {
    const token = "invite-token";
    const invited = member({
      clerkUserId: null,
      inviteTokenHash: hashDeploymentToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    const redeemed = member({
      inviteTokenHash: null,
      inviteRedeemedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    const updateQuery = createQuery([redeemed]);
    select.mockReturnValueOnce(createQuery([invited]));
    update.mockReturnValueOnce(updateQuery);

    await expect(redeemInvitation(token, "user_1", "ada@papernest.com")).resolves.toEqual(redeemed);
    const stored = (updateQuery.set as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(stored.clerkUserId).toBe("user_1");
    expect(stored.inviteTokenHash).toBeNull();
    expect(stored.inviteRedeemedAt).toBeInstanceOf(Date);
  });

  it("rejects redeem when the signed-in email does not match", async () => {
    const token = "invite-token";
    select.mockReturnValueOnce(
      createQuery([
        member({
          clerkUserId: null,
          email: "ada@papernest.com",
          inviteTokenHash: hashDeploymentToken(token),
          inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
        }),
      ]),
    );

    await expect(redeemInvitation(token, "user_2", "lee@papernest.com")).rejects.toMatchObject({
      statusCode: 403,
      message: "Sign in with the Google account that was invited.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects expired, redeemed, and unknown tokens", async () => {
    select.mockReturnValueOnce(
      createQuery([
        member({
          clerkUserId: null,
          inviteTokenHash: hashDeploymentToken("expired"),
          inviteExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
        }),
      ]),
    );
    await expect(redeemInvitation("expired", "user_1", "ada@papernest.com")).rejects.toMatchObject({
      statusCode: 400,
      message: "This invite link has expired. Ask for a new one.",
    });

    select.mockReturnValueOnce(
      createQuery([
        member({
          inviteTokenHash: hashDeploymentToken("used"),
          inviteRedeemedAt: new Date("2026-01-02T00:00:00.000Z"),
          inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
        }),
      ]),
    );
    await expect(redeemInvitation("used", "user_1", "ada@papernest.com")).rejects.toMatchObject({
      statusCode: 400,
      message: "This invite has already been used.",
    });

    select.mockReturnValueOnce(createQuery([]));
    await expect(redeemInvitation("missing", "user_1", "ada@papernest.com")).rejects.toMatchObject({
      statusCode: 400,
      message: "This invite link is not valid.",
    });
  });
});

describe("updateMemberRole and revokeMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks demoting the last editor", async () => {
    select
      .mockReturnValueOnce(createQuery([member()]))
      .mockReturnValueOnce(createQuery([{ value: 1 }]));

    await expect(updateMemberRole("member-1", "viewer")).rejects.toMatchObject({
      statusCode: 400,
      message: "The workspace must keep at least one editor.",
    });
  });

  it("blocks removing yourself", async () => {
    select.mockReturnValueOnce(createQuery([member({ email: "ada@papernest.com" })]));
    await expect(revokeMember("member-1", "ada@papernest.com")).rejects.toMatchObject({
      statusCode: 400,
      message: "You cannot remove yourself from the team.",
    });
  });
});
