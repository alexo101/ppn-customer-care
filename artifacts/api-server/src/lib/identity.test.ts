import { describe, expect, it } from "vitest";
import { displayNameFromProfile, USER_DISPLAY_NAME_FALLBACK } from "./identity";

describe("displayNameFromProfile", () => {
  it("prefers first name", () => {
    expect(
      displayNameFromProfile({
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
      }),
    ).toBe("Ada");
  });

  it("falls back to full name, then email local-part, then a greeting word", () => {
    expect(
      displayNameFromProfile({
        fullName: "Ada Lovelace",
        email: "ada@example.com",
      }),
    ).toBe("Ada Lovelace");
    expect(displayNameFromProfile({ email: "ada@example.com" })).toBe("ada");
    expect(displayNameFromProfile({})).toBe(USER_DISPLAY_NAME_FALLBACK);
  });
});
