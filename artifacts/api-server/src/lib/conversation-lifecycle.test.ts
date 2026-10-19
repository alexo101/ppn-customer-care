import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, analyticsMock, translateCustomerTemplateMock } = vi.hoisted(() => ({
  dbMock: {
    rows: [] as unknown[],
    appearances: [] as unknown[],
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  analyticsMock: vi.fn(),
  translateCustomerTemplateMock: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn((value) => ({ desc: value })),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
}));
vi.mock("@workspace/db", () => ({
  db: dbMock,
  conversationsTable: {
    id: "conversation.id",
    agentId: "conversation.agentId",
    status: "conversation.status",
    lastActivityAt: "conversation.lastActivityAt",
    metadata: "conversation.metadata",
  },
  agentConversationSettingsTable: { agentId: "settings.agentId" },
  appearanceSettingsTable: {
    agentId: "appearance.agentId",
    communicationLanguage: "appearance.communicationLanguage",
    updatedAt: "appearance.updatedAt",
    createdAt: "appearance.createdAt",
    id: "appearance.id",
  },
  messagesTable: { conversationId: "message.conversationId" },
}));
vi.mock("./welcome-message", () => ({
  translateCustomerTemplate: translateCustomerTemplateMock,
}));
vi.mock("./conversation-analytics", () => ({
  updateConversationAnalytics: analyticsMock,
}));
import {
  autoCloseDurationMs,
  isAutoClosed,
  nextAutoCloseAction,
  npsSubmitError,
  withAutoClosed,
} from "./conversation-auto-close";
import { closeInactiveConversations } from "./conversation-lifecycle";

const hourAgo = new Date("2026-09-02T15:00:00.000Z");
const now = new Date("2026-09-02T16:00:00.000Z");

const defaultSettings = {
  autoCloseDays: 0,
  autoCloseHours: 1,
  autoCloseMinutes: 0,
  closingMessage: "Thanks, closing now.",
  welcomeMessage:
    "Hello {user_name}, you are speaking {agent_name} Ai Agent. How can I help you?",
  escalationMessage: "Sorry {user_name}, I cannot answer that.",
};

describe("auto-close duration", () => {
  it("returns zero when every unit is zero", () => {
    expect(
      autoCloseDurationMs({
        autoCloseDays: 0,
        autoCloseHours: 0,
        autoCloseMinutes: 0,
        closingMessage: "",
        welcomeMessage: "",
        escalationMessage: "",
      }),
    ).toBe(0);
  });

  it("combines days, hours, and minutes", () => {
    expect(
      autoCloseDurationMs({
        autoCloseDays: 1,
        autoCloseHours: 2,
        autoCloseMinutes: 30,
        closingMessage: "",
        welcomeMessage: "",
        escalationMessage: "",
      }),
    ).toBe(((24 + 2) * 60 + 30) * 60 * 1000);
  });
});

describe("nextAutoCloseAction", () => {
  it("skips closed and escalated conversations", () => {
    expect(
      nextAutoCloseAction({
        status: "closed",
        lastActivityAt: hourAgo,
        settings: defaultSettings,
        now,
      }),
    ).toBe("skip");
    expect(
      nextAutoCloseAction({
        status: "escalated",
        lastActivityAt: hourAgo,
        settings: defaultSettings,
        now,
      }),
    ).toBe("skip");
  });

  it("skips when the configured duration is zero", () => {
    expect(
      nextAutoCloseAction({
        status: "active",
        lastActivityAt: hourAgo,
        settings: { ...defaultSettings, autoCloseHours: 0 },
        now,
      }),
    ).toBe("skip");
  });

  it("skips when the conversation is still inside the idle window", () => {
    expect(
      nextAutoCloseAction({
        status: "active",
        lastActivityAt: new Date("2026-09-02T15:30:00.000Z"),
        settings: defaultSettings,
        now,
      }),
    ).toBe("skip");
  });

  it("closes immediately after the idle window", () => {
    expect(
      nextAutoCloseAction({
        status: "active",
        lastActivityAt: hourAgo,
        settings: defaultSettings,
        now,
      }),
    ).toBe("close");
  });
});

describe("auto-close metadata", () => {
  it("marks a conversation as auto-closed and clears leftover confirmation flags", () => {
    const closed = withAutoClosed({
      subject: "Help",
      awaitingAutoCloseConfirmation: true,
      autoClosePromptedAt: now.toISOString(),
    });
    expect(isAutoClosed(closed)).toBe(true);
    expect(closed).toEqual({ subject: "Help", autoClosed: true });
  });
});

describe("npsSubmitError", () => {
  it("returns null when the conversation is missing", () => {
    expect(npsSubmitError(null)).toBeNull();
  });

  it("rejects open conversations", () => {
    expect(
      npsSubmitError({
        status: "active",
        npsScore: null,
        metadata: { autoClosed: true },
      }),
    ).toMatch(/closed/i);
  });

  it("rejects conversations that were not auto-closed", () => {
    expect(
      npsSubmitError({
        status: "closed",
        npsScore: null,
        metadata: {},
      }),
    ).toMatch(/automatic close/i);
  });

  it("rejects a second rating", () => {
    expect(
      npsSubmitError({
        status: "closed",
        npsScore: 8,
        metadata: { autoClosed: true },
      }),
    ).toMatch(/already/i);
  });

  it("allows a first score after automatic close", () => {
    expect(
      npsSubmitError({
        status: "closed",
        npsScore: null,
        metadata: { autoClosed: true },
      }),
    ).toBeNull();
  });
});

describe("closeInactiveConversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.rows = [
      {
        conversation: {
          id: "conversation-1",
          agentId: "agent-1",
          status: "active",
          lastActivityAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          metadata: {},
        },
        settings: {
          autoCloseDays: 0,
          autoCloseHours: 1,
          autoCloseMinutes: 0,
          closingMessage: "",
          welcomeMessage: "",
          escalationMessage: "",
        },
      },
    ];
    dbMock.appearances = [
      { agentId: "agent-1", language: "es" },
      { agentId: "agent-1", language: "en" },
    ];
    let selectCount = 0;
    dbMock.select.mockImplementation(() => {
      const result = selectCount++ === 0 ? dbMock.rows : dbMock.appearances;
      const builder = {
        from: vi.fn(() => builder),
        leftJoin: vi.fn(() => builder),
        where: vi.fn(() =>
          result === dbMock.rows ? Promise.resolve(result) : builder,
        ),
        orderBy: vi.fn(() => Promise.resolve(result)),
      };
      return builder;
    });
    dbMock.update.mockImplementation(() => {
      const builder = {
        set: vi.fn(() => builder),
        where: vi.fn().mockResolvedValue(undefined),
      };
      return builder;
    });
    dbMock.insert.mockImplementation(() => {
      const builder = {
        values: vi.fn(() => builder),
        returning: vi.fn().mockResolvedValue([{ id: "assistant-message" }]),
      };
      return builder;
    });
    translateCustomerTemplateMock.mockReset();
    translateCustomerTemplateMock.mockResolvedValue("Hasta luego.");
  });

  it("silently closes when the configured closing message is blank", async () => {
    await expect(closeInactiveConversations(now)).resolves.toEqual({
      closed: 1,
    });
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.update).toHaveBeenCalledOnce();
    expect(analyticsMock).toHaveBeenCalledWith("conversation-1");
  });

  it("uses the newest agent appearance language when duplicate settings remain", async () => {
    dbMock.rows = [
      {
        conversation: {
          id: "conversation-1",
          agentId: "agent-1",
          status: "active",
          lastActivityAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          metadata: {},
        },
        settings: { ...defaultSettings, closingMessage: "See you later." },
      },
    ];
    let selectCount = 0;
    dbMock.select.mockImplementation(() => {
      const result = selectCount++ === 0 ? dbMock.rows : dbMock.appearances;
      const builder = {
        from: vi.fn(() => builder),
        leftJoin: vi.fn(() => builder),
        where: vi.fn(() =>
          result === dbMock.rows ? Promise.resolve(result) : builder,
        ),
        orderBy: vi.fn(() => Promise.resolve(result)),
      };
      return builder;
    });

    await closeInactiveConversations(now);

    expect(translateCustomerTemplateMock).toHaveBeenCalledWith(
      "See you later.",
      "es",
      expect.any(String),
    );
  });
});
