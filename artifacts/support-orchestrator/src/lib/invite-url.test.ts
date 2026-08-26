import { describe, expect, it } from "vitest";
import { buildInviteUrl } from "./invite-url";

describe("buildInviteUrl", () => {
  it("joins the current origin, base path, and token without a hardcoded host", () => {
    expect(buildInviteUrl("abcToken", "https://preview.example.test", "/app/")).toBe(
      "https://preview.example.test/app/invite/abcToken",
    );
    expect(buildInviteUrl("abcToken", "http://localhost:5173", "/")).toBe(
      "http://localhost:5173/invite/abcToken",
    );
    expect(buildInviteUrl("abcToken", "https://prod.example.com", "")).toBe(
      "https://prod.example.com/invite/abcToken",
    );
  });
});
