import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, txMock, analyticsMock, translateCustomerTemplateMock } =
  vi.hoisted(() => {
    const state: {
      conversation: Record<string, any> | null;
      messages: Record<string, any>[];
      pendingUpdate: Record<string, any> | null;
    } = { conversation: null, messages: [], pendingUpdate: null };
    const tx: Record<string, any> = {};
    const db: Record<string, any> = {
      state,
      rows: [] as unknown[],
      appearances: [] as unknown[],
      select: vi.fn(),
      transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(tx),
      ),
    };

    tx.select = vi.fn(() => {
      const builder: Record<string, any> = {};
      builder.from = () => builder;
      builder.where = () => builder;
      builder.limit = () => builder;
      builder.for = async () => (state.conversation ? [state.conversation] : []);
      return builder;
    });
    tx.insert = vi.fn(() => {
      const builder: Record<string, any> = {};
      builder.values = (values: Record<string, any>) => {
        state.messages.push(values);
        return builder;
      };
      builder.returning = async () => [{ id: `message-${state.messages.length}` }];
      return builder;
    });
    tx.update = vi.fn(() => {
      const builder: Record<string, any> = {};
      builder.set = (values: Record<string, any>) => {
        state.pendingUpdate = values;
        return builder;
      };
      builder.where = () => {
        if (state.conversation && state.pendingUpdate) {
          Object.assign(state.conversation, state.pendingUpdate);
        }
        state.pendingUpdate = null;
        return builder;
      };
      builder.returning = async () =>
        state.conversation ? [state.conversation] : [];
      return builder;
    });

    return {
      dbMock: db,
      txMock: tx,
      analyticsMock: vi.fn(),
      translateCustomerTemplateMock: vi.fn(),
    };
  });

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
    userId: "conversation.userId",
    status: "conversation.status",
    lastActivityAt: "conversation.lastActivityAt",
    metadata: "conversation.metadata",
    conversationRating: "conversation.conversationRating",
    npsScore: "conversation.npsScore",
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
  DEFAULT_CONVERSATION_SETTINGS,
  hasAutoCloseFeedback,
  hasInactivityWarning,
  isValidInactivitySettings,
  nextInactivityAction,
  npsSubmitError,
  withAutoClosed,
} from "./conversation-auto-close";
import {
  closeInactiveConversations,
  conversationRatingSubmitError,
  submitConversationRating,
} from "./conversation-lifecycle";

const now = new Date("2026-09-02T16:00:00.000Z");
const lastActivityAt = new Date("2026-09-02T15:00:00.000Z");
let selectCount = 0;
const baseSettings = {
  ...DEFAULT_CONVERSATION_SETTINGS,
  warningAfterMinutes: 10,
  warningMessage: "",
  autoCloseAfterMinutes: 30,
  autoCloseMessage: "",
};

function setConversation(overrides: Record<string, unknown> = {}) {
  const conversation = {
    id: "conversation-1",
    agentId: "agent-1",
    userId: "owner-1",
    status: "active",
    lastActivityAt,
    metadata: {},
    conversationRating: null,
    npsScore: null,
    ...overrides,
  };
  dbMock.state.conversation = conversation;
  dbMock.rows = [{ conversation, settings: baseSettings }];
}

function selectBuilder(result: unknown, firstQuery: boolean) {
  const builder: Record<string, any> = {};
  builder.from = () => builder;
  builder.leftJoin = () => builder;
  builder.where = () => (firstQuery ? Promise.resolve(result) : builder);
  builder.orderBy = async () => result;
  return builder;
}

describe("inactivity action", () => {
  it("uses an independent warning and close threshold and lets close win if both passed", () => {
    expect(
      nextInactivityAction({
        status: "active",
        lastActivityAt,
        settings: baseSettings,
        now: new Date(lastActivityAt.getTime() + 15 * 60 * 1000),
      }),
    ).toBe("warn");
    expect(
      nextInactivityAction({
        status: "active",
        lastActivityAt,
        settings: baseSettings,
        now,
      }),
    ).toBe("close");
  });

  it("does not repeat a warning for the same activity timestamp", () => {
    expect(
      nextInactivityAction({
        status: "active",
        lastActivityAt,
        settings: baseSettings,
        warningForLastActivityAt: lastActivityAt.toISOString(),
        now: new Date(lastActivityAt.getTime() + 15 * 60 * 1000),
      }),
    ).toBe("skip");
  });

  it("skips disabled timers and closed or escalated conversations", () => {
    expect(
      nextInactivityAction({
        status: "active",
        lastActivityAt,
        settings: {
          ...baseSettings,
          warningAfterMinutes: 0,
          autoCloseAfterMinutes: 0,
        },
        now,
      }),
    ).toBe("skip");
    expect(
      nextInactivityAction({
        status: "closed",
        lastActivityAt,
        settings: baseSettings,
        now,
      }),
    ).toBe("skip");
    expect(
      nextInactivityAction({
        status: "escalated",
        lastActivityAt,
        settings: baseSettings,
        now,
      }),
    ).toBe("skip");
  });

  it("keeps the default one-hour automatic close without enabling a warning", () => {
    expect(
      nextInactivityAction({
        status: "active",
        lastActivityAt,
        settings: DEFAULT_CONVERSATION_SETTINGS,
        now: new Date(lastActivityAt.getTime() + 59 * 60 * 1000),
      }),
    ).toBe("skip");
    expect(
      nextInactivityAction({
        status: "active",
        lastActivityAt,
        settings: DEFAULT_CONVERSATION_SETTINGS,
        now: now,
      }),
    ).toBe("close");
  });

  it("requires a close timer later than an enabled warning timer", () => {
    expect(
      isValidInactivitySettings({
        warningAfterMinutes: 10,
        autoCloseAfterMinutes: 10,
      }),
    ).toBe(false);
    expect(
      isValidInactivitySettings({
        warningAfterMinutes: 10,
        autoCloseAfterMinutes: 11,
      }),
    ).toBe(true);
    expect(
      isValidInactivitySettings({
        warningAfterMinutes: 0,
        autoCloseAfterMinutes: 10,
      }),
    ).toBe(true);
  });
});

describe("auto-close metadata and ratings", () => {
  it("keeps warning eligibility and feedback metadata when the conversation closes", () => {
    const warningAt = lastActivityAt.toISOString();
    const closed = withAutoClosed({
      topic: "help",
      inactivityWarningFor: warningAt,
    });
    expect(closed).toMatchObject({
      topic: "help",
      autoClosed: true,
      autoCloseFeedback: true,
      inactivityWarningFor: warningAt,
    });
    expect(hasAutoCloseFeedback(closed)).toBe(true);
    expect(hasInactivityWarning(closed)).toBe(true);
    expect(npsSubmitError({
      status: "closed",
      npsScore: null,
      metadata: closed,
    })).toMatch(/thumbs/i);
    expect(
      conversationRatingSubmitError({
        status: "active",
        metadata: { inactivityWarningFor: warningAt },
        conversationRating: null,
      }),
    ).toBeNull();
    expect(
      conversationRatingSubmitError({
        status: "closed",
        metadata: closed,
        conversationRating: null,
      }),
    ).toBeNull();
    expect(
      conversationRatingSubmitError({
        status: "closed",
        metadata: closed,
        conversationRating: "positive",
      }),
    ).toMatch(/already/i);
  });

  it("does not enable thumbs feedback for a closure without an inactivity warning", () => {
    const closed = withAutoClosed({ topic: "help" });
    expect(closed).not.toHaveProperty("autoCloseFeedback");
    expect(
      conversationRatingSubmitError({
        status: "closed",
        metadata: closed,
        conversationRating: null,
      }),
    ).toMatch(/inactivity warning/i);
    expect(
      npsSubmitError({
        status: "closed",
        npsScore: null,
        metadata: closed,
      }),
    ).toBeNull();
  });

  it("stores one rating while a warned conversation is open without changing activity time", async () => {
    const warningAt = lastActivityAt.toISOString();
    setConversation({
      status: "active",
      metadata: { inactivityWarningFor: warningAt, autoCloseFeedback: true },
    });

    await expect(
      submitConversationRating("conversation-1", "owner-1", "positive"),
    ).resolves.toMatchObject({ conversationRating: "positive" });
    expect(dbMock.state.conversation?.lastActivityAt).toEqual(lastActivityAt);
    await expect(
      submitConversationRating("conversation-1", "owner-1", "negative"),
    ).rejects.toMatchObject({ name: "ConversationLifecycleError" });
  });

  it("rejects escalated and older auto-closed conversations without warning records", () => {
    expect(
      conversationRatingSubmitError({
        status: "closed",
        metadata: { autoClosed: true },
        conversationRating: null,
      }),
    ).toMatch(/inactivity warning/i);
    expect(
      conversationRatingSubmitError({
        status: "escalated",
        metadata: { inactivityWarningFor: lastActivityAt.toISOString() },
        conversationRating: null,
      }),
    ).toMatch(/escalated/i);
  });
});

describe("inactive conversation sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCount = 0;
    dbMock.state.messages = [];
    dbMock.state.pendingUpdate = null;
    setConversation();
    dbMock.select.mockImplementation(() => {
      const firstQuery = selectCount++ % 2 === 0;
      return selectBuilder(
        firstQuery ? dbMock.rows : dbMock.appearances,
        firstQuery,
      );
    });
    translateCustomerTemplateMock.mockImplementation(
      async (_template: string, _locale: string, fallback: string) => fallback,
    );
  });

  it("sends a warning without closing, then closes without repeating a stale warning", async () => {
    await expect(
      closeInactiveConversations(
        new Date(lastActivityAt.getTime() + 15 * 60 * 1000),
      ),
    ).resolves.toEqual({ warned: 1, closed: 0 });
    expect(dbMock.state.messages).toHaveLength(1);
    expect(dbMock.state.messages[0]).toMatchObject({
      metadata: { kind: "inactivity_warning" },
    });
    expect(dbMock.state.conversation.status).toBe("active");
    expect(dbMock.state.conversation.lastActivityAt).toEqual(lastActivityAt);

    await expect(closeInactiveConversations(now)).resolves.toEqual({
      warned: 0,
      closed: 1,
    });
    expect(dbMock.state.messages).toHaveLength(2);
    expect(dbMock.state.messages[1]).toMatchObject({
      metadata: { kind: "auto_close" },
    });
    expect(dbMock.state.conversation.status).toBe("closed");
    expect(dbMock.state.conversation.metadata).toMatchObject({
      autoClosed: true,
      autoCloseFeedback: true,
      autoCloseFlow: "warning_rating_v1",
      inactivityWarningFor: lastActivityAt.toISOString(),
    });
    expect(analyticsMock).toHaveBeenCalledWith("conversation-1");
  });

  it("closes directly when the sweep misses both thresholds", async () => {
    await expect(closeInactiveConversations(now)).resolves.toEqual({
      warned: 0,
      closed: 1,
    });
    expect(dbMock.state.messages).toHaveLength(1);
    expect(dbMock.state.messages[0]).toMatchObject({
      metadata: { kind: "auto_close" },
    });
    expect(dbMock.state.conversation?.metadata).not.toHaveProperty(
      "inactivityWarningFor",
    );
    expect(dbMock.state.conversation?.metadata).not.toHaveProperty(
      "autoCloseFeedback",
    );
  });
});
