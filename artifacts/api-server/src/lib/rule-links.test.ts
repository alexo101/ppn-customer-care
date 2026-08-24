import { describe, expect, it } from "vitest";
import { db, orchestratorRulesTable } from "@workspace/db";
import {
  databaseErrorDetails,
  replaceRuleLinks,
  ruleSaveClientMessage,
  uniqueLinkIds,
} from "./rule-links";

describe("uniqueLinkIds", () => {
  it("returns an empty list for missing or empty selections", () => {
    expect(uniqueLinkIds(undefined)).toEqual([]);
    expect(uniqueLinkIds([])).toEqual([]);
    expect(uniqueLinkIds(["", "  "])).toEqual([]);
  });

  it("drops duplicates while keeping first-seen order", () => {
    expect(uniqueLinkIds(["a", "b", "a", " c ", "b"])).toEqual(["a", "b", "c"]);
  });
});

describe("ruleSaveClientMessage", () => {
  it("maps foreign-key failures to a usable message", () => {
    expect(ruleSaveClientMessage({ code: "23503" })).toContain("no longer available");
  });

  it("does not expose raw database text", () => {
    expect(
      ruleSaveClientMessage({
        code: "42P01",
        message: 'relation "rule_connector_links" does not exist',
      }),
    ).not.toContain("rule_connector_links");
    expect(
      ruleSaveClientMessage(new Error("password=secret relation does not exist")),
    ).toBe("Could not save this rule. Please try again.");
  });
});

describe("databaseErrorDetails", () => {
  it("keeps diagnostic fields without inventing extras", () => {
    expect(
      databaseErrorDetails({
        name: "error",
        message: 'relation "rule_connector_links" does not exist',
        code: "42P01",
        constraint: undefined,
        table: "rule_connector_links",
        password: "secret",
      }),
    ).toEqual({
      name: "error",
      message: 'relation "rule_connector_links" does not exist',
      code: "42P01",
      constraint: undefined,
      table: "rule_connector_links",
    });
  });
});

describe("replaceRuleLinks", () => {
  it("accepts empty connector selections without failing", async () => {
    const [rule] = await db
      .select({ id: orchestratorRulesTable.id })
      .from(orchestratorRulesTable)
      .limit(1);
    expect(rule).toBeTruthy();

    await expect(
      db.transaction(async (tx) => {
        await replaceRuleLinks(tx, rule!.id, [], [], [], []);
        throw new Error("rollback-test");
      }),
    ).rejects.toThrow("rollback-test");
  });
});
