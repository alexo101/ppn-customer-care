import { describe, expect, it } from "vitest";
import { appDomainAttribute, matchesAudienceTarget } from "./targets";

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

    expect(matchesAudienceTarget({ matchMode: "any", conditions }, user)).toBe(true);
    expect(matchesAudienceTarget({ matchMode: "all", conditions }, user)).toBe(false);
  });

  it("matches the website domain the user is visiting", () => {
    expect(appDomainAttribute("App.Example.com")).toBe("app.example.com");
    expect(appDomainAttribute("https://app.example.com/help")).toBe("app.example.com");
    expect(appDomainAttribute("")).toBe("");

    expect(
      matchesAudienceTarget(
        {
          matchMode: "all",
          conditions: [
            {
              personType: "user",
              attribute: "app_domain",
              operator: "is",
              value: "app.example.com",
            },
          ],
        },
        { personType: "user", attributes: { app_domain: appDomainAttribute("https://app.example.com/help") } },
      ),
    ).toBe(true);
  });

  it("always matches everyone when a target has no conditions", () => {
    const everyone = { matchMode: "all" as const, conditions: [] };
    expect(matchesAudienceTarget(everyone, user)).toBe(true);
    expect(matchesAudienceTarget(everyone, { personType: "visitor", attributes: {} })).toBe(true);
    expect(matchesAudienceTarget(everyone, { personType: "lead", attributes: { email: "a@b.com" } })).toBe(true);
  });
});
