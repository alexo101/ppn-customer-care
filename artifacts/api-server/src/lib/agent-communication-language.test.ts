import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLatestAgentAppearance } = vi.hoisted(() => ({
  getLatestAgentAppearance: vi.fn(),
}));

vi.mock("./agent-appearance-settings", () => ({
  getLatestAgentAppearance,
}));

import { getAgentCommunicationLanguage } from "./agent-communication-language";

describe("getAgentCommunicationLanguage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the canonical agent Appearance language", async () => {
    getLatestAgentAppearance.mockResolvedValue({
      communicationLanguage: "es",
    });

    await expect(getAgentCommunicationLanguage("agent-1")).resolves.toBe("es");
    expect(getLatestAgentAppearance).toHaveBeenCalledWith("agent-1");
  });

  it("defaults to English when there is no assigned agent", async () => {
    await expect(getAgentCommunicationLanguage(null)).resolves.toBe("en");
    expect(getLatestAgentAppearance).not.toHaveBeenCalled();
  });
});
