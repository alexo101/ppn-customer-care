import { describe, expect, it } from "vitest";
import { canManage } from "./tenant";

describe("tenant roles", () => {
  it("allows owners and admins to manage organization resources", () => {
    expect(canManage("owner")).toBe(true);
    expect(canManage("admin")).toBe(true);
  });

  it("keeps regular members read-only", () => {
    expect(canManage("member")).toBe(false);
    expect(canManage("unknown")).toBe(false);
  });
});
