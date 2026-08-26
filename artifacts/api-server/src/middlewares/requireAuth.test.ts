import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { getAuth, resolveUserEmail, ensureWorkspaceMember } = vi.hoisted(() => ({
  getAuth: vi.fn(),
  resolveUserEmail: vi.fn(),
  ensureWorkspaceMember: vi.fn(),
}));

vi.mock("@clerk/express", () => ({ getAuth }));
vi.mock("../lib/identity", () => ({ resolveUserEmail }));
vi.mock("../lib/workspace-access", async () => {
  const actual = await vi.importActual<typeof import("../lib/workspace-access")>(
    "../lib/workspace-access",
  );
  return {
    ...actual,
    ensureWorkspaceMember,
  };
});

import { WorkspaceAccessError } from "../lib/workspace-access";
import { requireAuth, requireEditor } from "./requireAuth";

function makeResponse() {
  return {
    json: vi.fn(),
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("requireAuth", () => {
  beforeEach(() => {
    getAuth.mockReset();
    resolveUserEmail.mockReset();
    ensureWorkspaceMember.mockReset();
  });

  it("attaches a workspace member and disables response caching", async () => {
    getAuth.mockReturnValue({
      userId: "user_a",
      sessionClaims: { email: "ada@papernest.com" },
    });
    resolveUserEmail.mockResolvedValue("ada@papernest.com");
    ensureWorkspaceMember.mockResolvedValue({
      email: "ada@papernest.com",
      role: "editor",
    });
    const req = {} as Request;
    const res = makeResponse();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(req.userId).toBe("user_a");
    expect(req.userEmail).toBe("ada@papernest.com");
    expect(req.memberRole).toBe("editor");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects requests without a Clerk user ID", async () => {
    getAuth.mockReturnValue({ userId: null });
    const req = {} as Request;
    const res = makeResponse();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects users who are not invited", async () => {
    getAuth.mockReturnValue({
      userId: "user_b",
      sessionClaims: { email: "lee@papernest.com" },
    });
    resolveUserEmail.mockResolvedValue("lee@papernest.com");
    ensureWorkspaceMember.mockRejectedValue(
      new WorkspaceAccessError("You have not been invited to this workspace."),
    );
    const req = {} as Request;
    const res = makeResponse();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "You have not been invited to this workspace.",
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireEditor", () => {
  it("allows editors through", () => {
    const req = { userId: "user_a", memberRole: "editor" } as Request;
    const res = makeResponse();
    const next = vi.fn();

    requireEditor(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects viewers", () => {
    const req = { userId: "user_a", memberRole: "viewer" } as Request;
    const res = makeResponse();
    const next = vi.fn();

    requireEditor(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "You need edit access to change this workspace.",
    });
    expect(next).not.toHaveBeenCalled();
  });
});
