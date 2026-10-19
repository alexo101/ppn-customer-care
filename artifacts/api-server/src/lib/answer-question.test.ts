import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listEligiblePublishedArticles,
  retrieveRelevantChunks,
  createAnswerProvider,
  createEmbeddingProvider,
  selectLimit,
} = vi.hoisted(() => ({
  listEligiblePublishedArticles: vi.fn(),
  retrieveRelevantChunks: vi.fn(),
  createAnswerProvider: vi.fn(),
  createEmbeddingProvider: vi.fn(),
  selectLimit: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: selectLimit,
        }),
      }),
    }),
  },
  agentSettingsTable: { agentId: "agentId" },
}));

vi.mock("./retrieval", () => ({
  listEligiblePublishedArticles,
  retrieveRelevantChunks,
}));

vi.mock("./llm/openai-welcome-message-translator", () => ({
  OpenAIWelcomeMessageTranslator: class {
    async translate() {
      throw new Error("translator unavailable");
    }
  },
}));

vi.mock("./llm", async () => {
  const actual = await vi.importActual<typeof import("./llm")>("./llm");
  return {
    ...actual,
    createAnswerProvider,
    createEmbeddingProvider,
  };
});

import { answerFromKnowledge } from "./answer-question";

const person = { personType: "user" as const, attributes: {} };
const baseInput = {
  message: "Where is my invoice?",
  history: [{ sender: "user", content: "Where is my invoice?" }],
  agentId: "agent-1",
  person,
  context: {},
  replyLocaleCandidates: [],
  userName: "Ada",
  escalationTemplate: "{user_name}, I can connect you with a person.",
};

describe("answerFromKnowledge", () => {
  beforeEach(() => {
    listEligiblePublishedArticles.mockReset();
    retrieveRelevantChunks.mockReset();
    createAnswerProvider.mockReset();
    createEmbeddingProvider.mockReset();
    selectLimit.mockReset();
    selectLimit.mockResolvedValue([]);
    createEmbeddingProvider.mockReturnValue({ embed: vi.fn() });
  });

  it("offers escalation when no published article is eligible", async () => {
    listEligiblePublishedArticles.mockResolvedValue([]);

    const result = await answerFromKnowledge(baseInput);

    expect(retrieveRelevantChunks).not.toHaveBeenCalled();
    expect(createAnswerProvider).not.toHaveBeenCalled();
    expect(result.answerable).toBe(false);
    expect(result.responseText).toContain("Ada, I couldn't find enough information");
    expect(result.responseText).toContain("Ada, I can connect you with a person.");
    expect(result.assistantMetadata).toMatchObject({
      kind: "unable_to_answer",
      actions: ["escalate"],
      citations: [],
    });
  });

  it("does not answer from chunks that fail retrieval", async () => {
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "article-1", title: "Billing", targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({ chunks: [], totalTokens: 3, model: "embed" });

    const result = await answerFromKnowledge(baseInput);

    expect(result.answerable).toBe(false);
    expect(result.assistantMetadata).toMatchObject({ actions: ["escalate"] });
    expect(createAnswerProvider).not.toHaveBeenCalled();
  });

  it("discards an unanswerable model reply and offers escalation", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "I invented an account balance of $40.",
      answerable: false,
      model: "gpt-test",
      totalTokens: 8,
      promptAssembled: "prompt",
      citations: [{ articleId: "article-1", articleName: "Billing" }],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "article-1", title: "Billing", targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [
        {
          sourceId: "article-1",
          sourceName: "Billing",
          articleId: "article-1",
          articleName: "Billing",
          content: "Invoices are in Settings.",
          distance: 0.2,
        },
      ],
      totalTokens: 4,
      model: "embed",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge(baseInput);

    expect(result.answerable).toBe(false);
    expect(result.responseText).not.toContain("$40");
    expect(result.responseText).toContain("couldn't find enough information");
    expect(result.assistantMetadata).toMatchObject({ actions: ["escalate"], citations: [] });
    expect(result.articlesUsed).toEqual(["Billing"]);
  });

  it("returns a grounded answer with article citations", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Invoices are in Settings.",
      answerable: true,
      model: "gpt-test",
      totalTokens: 8,
      promptAssembled: "prompt",
      citations: [
        {
          articleId: "article-1",
          articleName: "Billing",
          sourceId: "article-1",
          sourceName: "Billing",
          assetId: "asset-1",
        },
      ],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "article-1", title: "Billing", targetId: "target-1" },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [
        {
          sourceId: "article-1",
          sourceName: "Billing",
          articleId: "article-1",
          articleName: "Billing",
          content: "Invoices are in Settings.",
          distance: 0.1,
        },
      ],
      totalTokens: 4,
      model: "embed",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge(baseInput);

    expect(result.answerable).toBe(true);
    expect(result.responseText).toContain("Invoices are in Settings.");
    expect(result.articleIds).toEqual(["article-1"]);
    expect(result.assistantMetadata).toEqual({
      citations: [
        expect.objectContaining({
          articleId: "article-1",
          articleName: "Billing",
          assetId: "asset-1",
        }),
      ],
    });
  });

  it("keeps Training replies in the saved agent language when the browser and question are English", async () => {
    listEligiblePublishedArticles.mockResolvedValue([]);

    const result = await answerFromKnowledge({
      ...baseInput,
      message: "Where is my invoice?",
      context: { agent_language: "es", browser_language: "en-US" },
      replyLocaleCandidates: ["en-US", "es"],
    });

    expect(result.responseText).toContain("no he encontrado suficiente información");
    expect(result.responseText).toContain("agente de soporte");
    expect(result.responseText).not.toContain("couldn't find enough information");
  });

  it("asks the answer model to use the saved language instead of the browser language", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Las facturas están en Ajustes.",
      answerable: true,
      replyLanguage: "es",
      model: "gpt-test",
      totalTokens: 8,
      promptAssembled: "prompt",
      citations: [],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "article-1", title: "Billing", targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [
        {
          sourceId: "article-1",
          sourceName: "Billing",
          articleId: "article-1",
          articleName: "Billing",
          content: "Invoices are in Settings.",
          distance: 0.1,
        },
      ],
      totalTokens: 4,
      model: "embed",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge({
      ...baseInput,
      message: "Where is my invoice?",
      context: { agent_language: "es", browser_language: "en-US" },
      replyLocaleCandidates: ["en-US"],
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ agent_language: "es" }),
        message: "Where is my invoice?",
      }),
    );
    expect(result.responseText).toContain("Las facturas están en Ajustes.");
  });
});
