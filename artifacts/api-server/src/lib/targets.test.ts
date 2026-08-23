import { describe, expect, it } from "vitest";
import { matchesAudienceTarget } from "./targets";

const user = {
  personType: "user" as const,
  attributes: {
    email: "alex@acme.com",
    user_id: "user_123",
  },
};

describe("matchesAudienceTarget", () => {
  it("matches an email domain with contains", () => {
    expect(
      matchesAudienceTarget(
        {
          isEnabled: true,
          matchMode: "all",
          conditions: [
            {
              personType: "user",
              attribute: "email",
              operator: "contains",
              value: "@acme.com",
            },
          ],
        },
        user,
      ),
    ).toBe(true);
  });

  it("does not match an unknown email", () => {
    expect(
      matchesAudienceTarget(
        {
          isEnabled: true,
          matchMode: "all",
          conditions: [
            {
              personType: "user",
              attribute: "email",
              operator: "contains",
              value: "@acme.com",
            },
          ],
        },
        { personType: "user", attributes: {} },
      ),
    ).toBe(false);
  });

  it("supports known and unknown email checks", () => {
    const target = {
      isEnabled: true,
      matchMode: "all" as const,
      conditions: [
        {
          personType: "user",
          attribute: "email",
          operator: "is_known",
          value: "",
        },
      ],
    };
    expect(matchesAudienceTarget(target, user)).toBe(true);
    expect(matchesAudienceTarget(target, { personType: "user", attributes: {} })).toBe(false);
  });

  it("honors any and all target match modes", () => {
    const conditions = [
      {
        personType: "user",
        attribute: "email",
        operator: "contains",
        value: "@other.com",
      },
      {
        personType: "user",
        attribute: "user_id",
        operator: "is",
        value: "user_123",
      },
    ];

    expect(matchesAudienceTarget({ isEnabled: true, matchMode: "any", conditions }, user)).toBe(true);
    expect(matchesAudienceTarget({ isEnabled: true, matchMode: "all", conditions }, user)).toBe(false);
  });

  it("matches everyone when a target has no conditions", () => {
    const everyone = { isEnabled: true, matchMode: "all" as const, conditions: [] };
    expect(matchesAudienceTarget(everyone, user)).toBe(true);
    expect(matchesAudienceTarget(everyone, { personType: "visitor", attributes: {} })).toBe(true);
    expect(matchesAudienceTarget(everyone, { personType: "lead", attributes: { email: "a@b.com" } })).toBe(true);
    expect(
      matchesAudienceTarget({ ...everyone, isEnabled: false }, user),
    ).toBe(false);
  });
});
