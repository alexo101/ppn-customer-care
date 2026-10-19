import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectResult = {
  rows: unknown[];
  resolveAtWhere: boolean;
};

const { selectResults, select } = vi.hoisted(() => ({
  selectResults: [] as SelectResult[],
  select: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions) => conditions),
  asc: vi.fn((column) => ({ asc: column })),
  eq: vi.fn((column, value) => ({ column, value })),
  inArray: vi.fn((column, values) => ({ column, values })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: [...strings],
    values,
  }),
}));

vi.mock("@workspace/db", () => ({
  db: { select },
  audienceTargetsTable: {
    id: "target.id",
    isEnabled: "target.isEnabled",
  },
  knowledgeArticlesTable: {
    id: "article.id",
    agentId: "article.agentId",
    status: "article.status",
    title: "article.title",
    targetId: "article.targetId",
    embeddingModel: "article.embeddingModel",
  },
  knowledgeChunkAssetsTable: {
    chunkId: "assetLink.chunkId",
    assetId: "assetLink.assetId",
  },
  knowledgeChunksTable: {
    id: "chunk.id",
    articleId: "chunk.articleId",
    chunkIndex: "chunk.chunkIndex",
    content: "chunk.content",
    embedding: "chunk.embedding",
  },
  targetConditionsTable: { targetId: "condition.targetId" },
}));

import {
  isArticleRetrievalEligible,
  listEligiblePublishedArticles,
  retrieveRelevantChunks,
} from "./retrieval";

describe("knowledge retrieval", () => {
  beforeEach(() => {
    selectResults.length = 0;
    select.mockImplementation(() => {
      const result = selectResults.shift();
      if (!result) throw new Error("Unexpected database select in retrieval test.");
      const builder = {
        from: vi.fn(() => builder),
        innerJoin: vi.fn(() => builder),
        where: vi.fn(() =>
          result.resolveAtWhere ? Promise.resolve(result.rows) : builder,
        ),
        orderBy: vi.fn(() => builder),
        limit: vi.fn(() => Promise.resolve(result.rows)),
      };
      return builder;
    });
  });

  it("allows published unrestricted articles but excludes drafts and unmatched audiences", () => {
    expect(
      isArticleRetrievalEligible(
        { status: "published", targetId: null },
        new Set(),
      ),
    ).toBe(true);
    expect(
      isArticleRetrievalEligible(
        { status: "draft", targetId: null },
        new Set(),
      ),
    ).toBe(false);
    expect(
      isArticleRetrievalEligible(
        { status: "published", targetId: "target-1" },
        new Set(),
      ),
    ).toBe(false);
  });

  it("embeds the question and returns matching passages from eligible published articles", async () => {
    const article = {
      id: "article-published",
      title: "Cancelación del servicio",
      targetId: null,
      status: "published",
    };
    const chunkRow = {
      articleId: article.id,
      chunkId: "chunk-1",
      chunkIndex: 0,
      articleTitle: article.title,
      content: "To cancel, open Account settings and select Cancel service.",
      distance: 0.12,
    };
    const question = "¿Cómo puedo cancelar el servicio?";
    const embeddingProvider = {
      embed: vi.fn().mockResolvedValue({
        embeddings: [[0.1, 0.2, 0.3]],
        model: "test-embedding-model",
        totalTokens: 7,
      }),
      resolveModel: vi.fn().mockResolvedValue("test-embedding-model"),
    };
    selectResults.push(
      {
        rows: [
          article,
          {
            id: "article-draft",
            title: "Draft article",
            targetId: null,
            status: "draft",
          },
        ],
        resolveAtWhere: true,
      },
      { rows: [chunkRow], resolveAtWhere: false },
      { rows: [], resolveAtWhere: true },
    );

    const eligible = await listEligiblePublishedArticles("agent-1", {
      personType: "user",
      attributes: {},
    });
    const retrieval = await retrieveRelevantChunks(
      eligible.map((item) => item.id),
      question,
      embeddingProvider,
      5,
      { agentId: "agent-1" },
    );

    expect(eligible).toEqual([
      { id: article.id, title: article.title, targetId: null },
    ]);
    expect(embeddingProvider.embed).toHaveBeenCalledWith([question]);
    expect(retrieval.chunks).toMatchObject([
      {
        articleId: article.id,
        articleName: article.title,
        content: chunkRow.content,
        distance: 0.12,
      },
    ]);
    expect(retrieval.model).toBe("test-embedding-model");
    expect(retrieval.totalTokens).toBe(7);
  });
});
