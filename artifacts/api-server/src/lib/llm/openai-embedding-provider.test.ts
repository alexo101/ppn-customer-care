import { describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_CREDIT_BALANCE_MESSAGE,
  EMBEDDING_INVALID_API_KEY_MESSAGE,
  OpenAIEmbeddingProvider,
  NO_ACCESSIBLE_EMBEDDING_MODEL_MESSAGE,
  REQUIRED_EMBEDDING_DIMENSIONS,
  embeddingRequestOptions,
  selectEmbeddingCandidates,
} from "./openai-embedding-provider";

function vector(fill = 0.1, dimensions = REQUIRED_EMBEDDING_DIMENSIONS) {
  return Array.from({ length: dimensions }, () => fill);
}

function createClient(options: {
  models: string[];
  embeddings?: Record<string, {
    dimensions?: number;
    error?: {
      status: number;
      code?: string;
      message?: string;
      nested?: boolean;
    };
  }>;
  listError?: Error;
}) {
  const create = vi.fn(async ({ model, input }: { model: string; input: string | string[] }) => {
    const configured = options.embeddings?.[model];
    if (configured?.error) {
      const error = Object.assign(
        new Error(configured.error.message ?? configured.error.code),
        configured.error.nested
          ? {
              status: configured.error.status,
              error: {
                code: configured.error.code,
                message: configured.error.message,
              },
            }
          : configured.error,
      );
      throw error;
    }
    const texts = Array.isArray(input) ? input : [input];
    return {
      data: texts.map((_, index) => ({
        index,
        embedding: vector(0.2, configured?.dimensions ?? REQUIRED_EMBEDDING_DIMENSIONS),
      })),
      model,
      usage: { total_tokens: texts.length },
    };
  });

  return {
    create,
    client: {
      models: {
        list: options.listError
          ? async () => {
              throw options.listError;
            }
          : async function* () {
              for (const id of options.models) {
                yield { id };
              }
            },
      },
      embeddings: { create },
    },
  };
}

describe("selectEmbeddingCandidates", () => {
  it("does not probe known defaults when the project lists no embedding models", () => {
    expect(
      selectEmbeddingCandidates({
        configuredModel: null,
        listedModelIds: ["gpt-4o-mini", "gpt-5-nano"],
      }),
    ).toEqual([]);
  });

  it("verifies an explicit configured model even when it is not listed", () => {
    expect(
      selectEmbeddingCandidates({
        configuredModel: "text-embedding-3-small",
        listedModelIds: ["text-embedding-ada-002"],
      }),
    ).toEqual(["text-embedding-3-small", "text-embedding-ada-002"]);
  });

  it("uses listed compatible models when no model is configured", () => {
    expect(
      selectEmbeddingCandidates({
        configuredModel: undefined,
        listedModelIds: ["gpt-5-nano", "text-embedding-3-large"],
      }),
    ).toEqual(["text-embedding-3-large"]);
  });

  it("falls back to compatible models when listing fails", () => {
    expect(
      selectEmbeddingCandidates({
        configuredModel: null,
        listedModelIds: null,
      }),
    ).toEqual([
      "text-embedding-3-small",
      "text-embedding-ada-002",
      "text-embedding-3-large",
    ]);
  });
});

describe("embeddingRequestOptions", () => {
  it("requests 1,536 dimensions for text-embedding-3-large", () => {
    expect(embeddingRequestOptions("text-embedding-3-large")).toEqual({
      model: "text-embedding-3-large",
      dimensions: 1536,
    });
    expect(embeddingRequestOptions("text-embedding-ada-002")).toEqual({
      model: "text-embedding-ada-002",
    });
  });
});

describe("OpenAIEmbeddingProvider", () => {
  it("uses a listed accessible model without first calling an unlisted default", async () => {
    const { client, create } = createClient({
      models: ["gpt-5-nano", "text-embedding-ada-002"],
      embeddings: {
        "text-embedding-ada-002": {},
      },
    });
    const provider = new OpenAIEmbeddingProvider({ client });
    const result = await provider.embed(["hello"]);

    expect(result.model).toBe("text-embedding-ada-002");
    expect(result.embeddings[0]).toHaveLength(REQUIRED_EMBEDDING_DIMENSIONS);
    expect(create.mock.calls.map((call) => call[0].model)).toEqual([
      "text-embedding-ada-002",
      "text-embedding-ada-002",
    ]);
  });

  it("fails before embeddings.create when the project has no embedding models", async () => {
    const { client, create } = createClient({
      models: ["gpt-4o-mini", "gpt-5-nano"],
    });
    const provider = new OpenAIEmbeddingProvider({ client });

    await expect(provider.resolveModel()).rejects.toThrow(NO_ACCESSIBLE_EMBEDDING_MODEL_MESSAGE);
    expect(create).not.toHaveBeenCalled();
  });

  it("requests 1,536 dimensions when verifying text-embedding-3-large", async () => {
    const { client, create } = createClient({
      models: ["text-embedding-3-large"],
    });
    const provider = new OpenAIEmbeddingProvider({ client });
    await expect(provider.resolveModel()).resolves.toBe("text-embedding-3-large");
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: "text-embedding-3-large",
      dimensions: 1536,
    });
  });

  it("reports exhausted credit balance separately from model access", async () => {
    const { client } = createClient({
      models: ["text-embedding-3-small"],
      embeddings: {
        "text-embedding-3-small": {
          error: {
            status: 429,
            code: "credit_balance_exhausted",
            nested: true,
          },
        },
      },
    });
    const provider = new OpenAIEmbeddingProvider({ client });

    await expect(provider.resolveModel()).rejects.toThrow(
      EMBEDDING_CREDIT_BALANCE_MESSAGE,
    );
  });

  it("keeps invalid API key failures authentication-specific", async () => {
    const { client } = createClient({
      models: ["text-embedding-3-small"],
      embeddings: {
        "text-embedding-3-small": {
          error: { status: 401, code: "invalid_api_key" },
        },
      },
    });
    const provider = new OpenAIEmbeddingProvider({ client });

    await expect(provider.resolveModel()).rejects.toThrow(
      EMBEDDING_INVALID_API_KEY_MESSAGE,
    );
  });

  it("keeps model access failures on the no-accessible-model path", async () => {
    const { client } = createClient({
      models: ["text-embedding-3-small"],
      embeddings: {
        "text-embedding-3-small": {
          error: { status: 404, code: "model_not_found" },
        },
      },
    });
    const provider = new OpenAIEmbeddingProvider({ client });

    await expect(provider.resolveModel()).rejects.toThrow(
      NO_ACCESSIBLE_EMBEDDING_MODEL_MESSAGE,
    );
  });
});
