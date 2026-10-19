import { beforeEach, describe, expect, it, vi } from "vitest";

const { rows, select, limit, orderBy, where } = vi.hoisted(() => ({
  rows: [
    {
      id: "appearance-old",
      userId: "original-owner",
      agentId: "agent-1",
      communicationLanguage: "en",
      updatedAt: new Date("2026-08-25T14:42:24.582Z"),
      createdAt: new Date("2026-08-25T14:42:24.582Z"),
    },
    {
      id: "appearance-new",
      userId: "workspace-member",
      agentId: "agent-1",
      communicationLanguage: "es",
      updatedAt: new Date("2026-10-19T08:52:00.051Z"),
      createdAt: new Date("2026-10-19T08:52:00.051Z"),
    },
  ],
  select: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((column) => `desc(${column})`),
  eq: vi.fn((column, value) => ({ column, value })),
}));

vi.mock("@workspace/db", () => ({
  db: { select },
  appearanceSettingsTable: {
    agentId: "agentId",
    communicationLanguage: "communicationLanguage",
    updatedAt: "updatedAt",
    createdAt: "createdAt",
    id: "id",
  },
}));

import { getLatestAgentAppearance } from "./agent-appearance-settings";

describe("getLatestAgentAppearance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const builder = {
      from: vi.fn(() => builder),
      where,
      orderBy,
      limit,
    };
    select.mockReturnValue(builder);
    where.mockReturnValue(builder);
    orderBy.mockImplementation(() => {
      rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return builder;
    });
    limit.mockImplementation((count: number) =>
      Promise.resolve(rows.slice(0, count)),
    );
  });

  it("chooses the newest agent record regardless of which member created it", async () => {
    const appearance = await getLatestAgentAppearance("agent-1");

    expect(appearance).toMatchObject({
      id: "appearance-new",
      userId: "workspace-member",
      communicationLanguage: "es",
    });
    expect(where).toHaveBeenCalledWith({
      column: "agentId",
      value: "agent-1",
    });
    expect(orderBy).toHaveBeenCalledWith(
      "desc(updatedAt)",
      "desc(createdAt)",
      "desc(id)",
    );
    expect(limit).toHaveBeenCalledWith(1);
  });
});
