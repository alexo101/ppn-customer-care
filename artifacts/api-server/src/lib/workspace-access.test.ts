import { beforeEach, describe, expect, it, vi } from "vitest";

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
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

import {
  WorkspaceAccessError,
  ensureWorkspaceMember,
  inviteMember,
  isPapernestEmail,
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
