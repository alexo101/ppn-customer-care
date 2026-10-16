import { describe, expect, it } from "vitest";
import { buildAppearanceInsertValues, toAppearance } from "./appearance";
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_CTA_COLOR } from "../lib/importWebsiteStyles";

describe("appearance communication language persistence", () => {
  it("includes a selected language when creating a new agent appearance", () => {
    expect(
      buildAppearanceInsertValues("user-1", "agent-1", {
        communicationLanguage: "es",
      }),
    ).toMatchObject({
      userId: "user-1",
      agentId: "agent-1",
      communicationLanguage: "es",
    });
  });

  it("defaults new appearance records to English", () => {
    expect(buildAppearanceInsertValues("user-1", null, {})).toMatchObject({
      communicationLanguage: "en",
      ctaColor: DEFAULT_CTA_COLOR,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
    });
  });

  it("returns the saved language in the Appearance response", () => {
    const now = new Date("2026-10-16T00:00:00.000Z");
    expect(
      toAppearance({
        id: "appearance-1",
        userId: "user-1",
        agentId: "agent-1",
        websiteUrl: null,
        ctaColor: DEFAULT_CTA_COLOR,
        backgroundColor: DEFAULT_BACKGROUND_COLOR,
        logoUrl: null,
        communicationLanguage: "fr",
        tagText: null,
        tagStyle: "solid",
        importedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ communicationLanguage: "fr" });
  });
});
