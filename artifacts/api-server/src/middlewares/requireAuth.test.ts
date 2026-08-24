import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { getAuth } = vi.hoisted(() => ({
  getAuth: vi.fn(),
}));

vi.mock("@clerk/express", () => ({ getAuth }));

import { requireAuth } from "./requireAuth";

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
  });

  it("passes Clerk's user ID through and disables response caching", () => {
    getAuth.mockReturnValue({
      userId: "user_a",
      sessionClaims: { email: "a@example.com" },
    });
    const req = {} as Request;
    const res = makeResponse();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.userId).toBe("user_a");
    expect(req.userEmail).toBe("a@example.com");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects requests without a Clerk user ID", () => {
    getAuth.mockReturnValue({ userId: null });
    const req = {} as Request;
    const res = makeResponse();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(next).not.toHaveBeenCalled();
  });
});
