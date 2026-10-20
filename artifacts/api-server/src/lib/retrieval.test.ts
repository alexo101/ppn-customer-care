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
  or: vi.fn((...conditions) => conditions),
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
  areNearDuplicateSearchQueries,
  isArticleRetrievalEligible,
  listEligiblePublishedArticles,
  retrieveRelevantChunks,
  scoreLexicalMatch,
} from "./retrieval";

describe("knowledge retrieval", () => {
  it("recognizes close rephrases without treating added topics as repeats", () => {
    expect(
      areNearDuplicateSearchQueries(
        "Como encuentro las facturas?",
        "Cómo encuentro mis facturas?",
      ),
    ).toBe(true);
    expect(
      areNearDuplicateSearchQueries(
        "Cómo encuentro las facturas de mi agencia?",
        "Cómo encuentro mis facturas?",
      ),
    ).toBe(false);
    expect(
      areNearDuplicateSearchQueries(
        "No veo la sección Ingresos",
        "Cómo encuentro mis facturas?",
      ),
    ).toBe(false);
  });

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

  it("accepts the documented Spanish phrasings but rejects weak lexical overlap", async () => {
    const answerablePassage =
      "Quiero saber si han llamado a mi cliente. En la tabla de clientes, si ya se ha empezado un contrato, significa que la llamada ya ha ocurrido.";
    const callbackPassage =
      "Quiero que me contacten / Quiero que me llamen. Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma.";

    expect(
      scoreLexicalMatch(
        "Cómo sé si han llamado a mi cliente?",
        answerablePassage,
      ).accepted,
    ).toBe(true);
    expect(
      scoreLexicalMatch("Quiero que me llamen", callbackPassage).accepted,
    ).toBe(true);
    expect(
      scoreLexicalMatch(
        "¿Cuál es mi contraseña secreta?",
        callbackPassage,
      ).accepted,
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
      { rows: [], resolveAtWhere: false },
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
    expect(retrieval.diagnostics).toEqual({
      vectorCandidates: 1,
      lexicalCandidates: 0,
      lexicalAccepted: 0,
    });
  });

  it("includes the next article chunk when a matching FAQ question is split at the boundary", async () => {
    const question = "No veo la sección Ingresos";
    const questionChunk = {
      articleId: "billing-article",
      chunkId: "billing-chunk-0",
      chunkIndex: 0,
      articleTitle: "Pagos y facturación (agentes)",
      content:
        "No veo la sección Ingresos en mi agencia / No me aparece la sección Ingresos",
      distance: 0.1,
    };
    const answerChunk = {
      articleId: "billing-article",
      chunkId: "billing-chunk-1",
      chunkIndex: 1,
      articleTitle: "Pagos y facturación (agentes)",
      content:
        "Para ver la sección Ingresos tienes que ser el Admin de tu agencia. Contacta con tu account manager para que lo configure.",
    };
    const embeddingProvider = {
      embed: vi.fn().mockResolvedValue({
        embeddings: [[0.1, 0.2, 0.3]],
        model: "test-embedding-model",
        totalTokens: 6,
      }),
      resolveModel: vi.fn().mockResolvedValue("test-embedding-model"),
    };
    selectResults.push(
      { rows: [questionChunk], resolveAtWhere: false },
      { rows: [answerChunk], resolveAtWhere: true },
      { rows: [], resolveAtWhere: true },
    );

    const retrieval = await retrieveRelevantChunks(
      ["billing-article"],
      question,
      embeddingProvider,
      5,
      { agentId: "agent-1" },
    );

    expect(retrieval.chunks).toMatchObject([
      {
        chunkId: "billing-chunk-0",
        content: questionChunk.content,
      },
      {
        chunkId: "billing-chunk-1",
        content: answerChunk.content,
      },
    ]);
  });

  it.each([
    {
      question: "Cómo sé si han llamado a mi cliente?",
      content:
        "Quiero saber si han llamado a mi cliente. En la tabla de clientes, si ya se ha empezado un contrato, significa que la llamada ya ha ocurrido.",
    },
    {
      question: "Quiero que me llamen",
      content:
        "Quiero que me contacten / Quiero que me llamen. Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma.",
    },
  ])("retrieves FAQ passage for $question when vector search misses it", async ({
    question,
    content,
  }) => {
    const article = {
      id: "article-support",
      title: "Soporte de clientes",
      targetId: null,
      status: "published",
    };
    const lexicalRow = {
      articleId: article.id,
      chunkId: `chunk-${question.length}`,
      chunkIndex: 0,
      articleTitle: article.title,
      content,
    };
    const embeddingProvider = {
      embed: vi.fn().mockResolvedValue({
        embeddings: [[0.1, 0.2, 0.3]],
        model: "test-embedding-model",
        totalTokens: 6,
      }),
      resolveModel: vi.fn().mockResolvedValue("test-embedding-model"),
    };
    selectResults.push(
      { rows: [article], resolveAtWhere: true },
      { rows: [], resolveAtWhere: false },
      { rows: [lexicalRow], resolveAtWhere: false },
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

    expect(retrieval.chunks).toMatchObject([
      {
        articleId: article.id,
        articleName: article.title,
        content,
      },
    ]);
    expect(retrieval.diagnostics).toEqual({
      vectorCandidates: 0,
      lexicalCandidates: 1,
      lexicalAccepted: 1,
    });
  });

  it("runs lexical fallback when three semantic hits have weak query overlap", async () => {
    const article = {
      id: "article-support",
      title: "Soporte de clientes",
      targetId: null,
      status: "published",
    };
    const question = "Quiero que me llamen";
    const faqContent =
      "Quiero que me contacten / Quiero que me llamen. Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma.";
    const weakVectorRows = [
      "La factura mensual se puede descargar desde el panel de pagos.",
      "Para gestionar un contrato, abre el apartado de operaciones.",
      "Los miembros del equipo aparecen en la sección de configuración.",
    ].map((content, index) => ({
      articleId: article.id,
      chunkId: `weak-${index}`,
      chunkIndex: index,
      articleTitle: article.title,
      content,
      distance: 0.2 + index * 0.01,
    }));
    const embeddingProvider = {
      embed: vi.fn().mockResolvedValue({
        embeddings: [[0.1, 0.2, 0.3]],
        model: "test-embedding-model",
        totalTokens: 6,
      }),
      resolveModel: vi.fn().mockResolvedValue("test-embedding-model"),
    };
    selectResults.push(
      { rows: [article], resolveAtWhere: true },
      { rows: weakVectorRows, resolveAtWhere: false },
      {
        rows: [
          {
            articleId: article.id,
            chunkId: "faq-callback",
            chunkIndex: 3,
            articleTitle: article.title,
            content: faqContent,
          },
        ],
        resolveAtWhere: false,
      },
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

    expect(retrieval.diagnostics).toEqual({
      vectorCandidates: 3,
      lexicalCandidates: 1,
      lexicalAccepted: 1,
    });
    expect(retrieval.chunks[0]).toMatchObject({
      chunkId: "faq-callback",
      content: faqContent,
      distance: 1,
    });
  });
});
