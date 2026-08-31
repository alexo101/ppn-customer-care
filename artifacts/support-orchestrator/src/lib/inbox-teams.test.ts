import { describe, expect, it } from "vitest";
import { inboxTeamLabel, inboxTeamsFromConfigured } from "./inbox-teams";

describe("inbox team labels", () => {
  it("uses the configured Team name field", () => {
    expect(inboxTeamLabel("Customer Care France")).toBe("Customer Care France");
    expect(
      inboxTeamsFromConfigured([
        { agentId: "a", teamName: "Technical Support", openCount: 2 },
        { agentId: "b", teamName: "Customer Care Italy", openCount: 1 },
      ]).map((team) => team.teamName),
    ).toEqual(["Customer Care Italy", "Technical Support"]);
  });

  it("falls back to the agent name when the team name is empty or default", () => {
    expect(inboxTeamLabel("", "Billing support")).toBe("Billing support");
    expect(inboxTeamLabel("Escalation team", "Billing support")).toBe(
      "Billing support",
    );
    expect(
      inboxTeamsFromConfigured([
        {
          agentId: "a",
          teamName: "Escalation team",
          agentName: "Billing support",
        },
      ]).map((team) => team.teamName),
    ).toEqual(["Billing support"]);
  });

  it("falls back to Escalation team only when both names are empty", () => {
    expect(inboxTeamLabel("")).toBe("Escalation team");
    expect(inboxTeamLabel("   ")).toBe("Escalation team");
  });
});
