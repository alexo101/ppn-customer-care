import OpenAI from "openai";
import { logger } from "../logger";
import {
  EmbeddingProviderError,
  type EmbeddingProvider,
  type EmbeddingProviderResult,
} from "./embedding-provider";

export const REQUIRED_EMBEDDING_DIMENSIONS = 1536;

export const COMPATIBLE_EMBEDDING_MODELS = [
  "text-embedding-3-small",
  "text-embedding-ada-002",
  "text-embedding-3-large",
] as const;

export const NO_ACCESSIBLE_EMBEDDING_MODEL_MESSAGE =
  "This OpenAI project has no accessible embedding model that produces 1,536-dimensional vectors. Grant the project access to text-embedding-3-small, text-embedding-ada-002, or text-embedding-3-large, then retry indexing.";

export const EMBEDDING_CREDIT_BALANCE_MESSAGE =
  "The OpenAI project has no available credit balance for embeddings. Restore the project's credit balance, then retry indexing.";

export const EMBEDDING_INVALID_API_KEY_MESSAGE =
  "The embedding model request failed (invalid_api_key).";

type EmbeddingClient = {
  models: {
    list: () => AsyncIterable<{ id: string }> | Promise<{ data: Array<{ id: string }> }>;
  };
  embeddings: {
    create: (body: {
      model: string;
      input: string | string[];
      dimensions?: number;
    }) => Promise<{
      data: Array<{ index: number; embedding: number[] }>;
      model?: string;
      usage?: { total_tokens?: number };
    }>;
  };
};

export function isEmbeddingModelId(id: string): boolean {
  return /embed/i.test(id);
}

export function embeddingRequestOptions(model: string): {
  model: string;
  dimensions?: number;
} {
  if (model === "text-embedding-3-large" || /embedding-3-large/i.test(model)) {
    return { model, dimensions: REQUIRED_EMBEDDING_DIMENSIONS };
  }
  return { model };
}

export function selectEmbeddingCandidates(options: {
  configuredModel?: string | null;
  listedModelIds: string[] | null;
}): string[] {
  const configured = options.configuredModel?.trim() || "";
  const compatible: string[] = [...COMPATIBLE_EMBEDDING_MODELS];

  if (options.listedModelIds === null) {
    return uniqueNonEmpty([configured, ...compatible]);
  }

  const listedEmbedding = options.listedModelIds.filter(isEmbeddingModelId);
  if (listedEmbedding.length === 0) {
    return configured ? [configured] : [];
  }

  const listedCompatible = compatible.filter((model) =>
    listedEmbedding.includes(model),
  );
  return uniqueNonEmpty([
    configured,
    ...listedCompatible,
    ...listedEmbedding.filter((id) => !compatible.includes(id)),
  ]);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function readProviderError(error: unknown): {
  status?: number;
  code?: string;
  message?: string;
  requestId?: string;
} {
  const providerError = error as {
    status?: number;
    code?: string;
    message?: string;
    request_id?: string;
    error?: { code?: string; message?: string };
  };
  return {
    status: providerError.status,
    code: providerError.error?.code ?? providerError.code,
    message: providerError.error?.message ?? providerError.message,
    requestId: providerError.request_id,
  };
}

function isCreditBalanceError(error: {
  code?: string;
  message?: string;
}): boolean {
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  return (
    code === "credit_balance_exhausted" ||
    code === "insufficient_quota" ||
    code === "billing_hard_limit_reached" ||
    /credit balance|insufficient quota|billing(?: hard)? limit|quota (?:has been )?(?:exhausted|exceeded|insufficient)/i.test(
      message,
    )
  );
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: EmbeddingClient;
  private readonly configuredModel: string | null;
  private verifiedModel: string | null = null;
  private resolvePromise: Promise<string> | null = null;

  constructor(options?: { apiKey?: string; model?: string; client?: EmbeddingClient }) {
    if (options?.client) {
      this.client = options.client;
    } else {
      const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new EmbeddingProviderError(
          "Knowledge retrieval is not configured. Set OPENAI_API_KEY to enable it.",
        );
      }
      this.client = new OpenAI({ apiKey }) as EmbeddingClient;
    }
    this.configuredModel =
      options?.model?.trim() || process.env.EMBEDDING_MODEL?.trim() || null;
  }

  async resolveModel(): Promise<string> {
    if (this.verifiedModel) return this.verifiedModel;
    this.resolvePromise ??= this.discoverAndVerifyModel();
    try {
      const model = await this.resolvePromise;
      this.verifiedModel = model;
      return model;
    } catch (error) {
      this.resolvePromise = null;
      throw error;
    }
  }

  async embed(texts: string[]): Promise<EmbeddingProviderResult> {
    const model = await this.resolveModel();
    if (texts.length === 0) {
      return { embeddings: [], model, totalTokens: 0 };
    }

    try {
      const response = await this.createEmbedding(texts, model);
      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
      if (embeddings.length !== texts.length) {
        throw new EmbeddingProviderError(
          "The embedding model returned an incomplete response.",
        );
      }
      if (embeddings.some((embedding) => embedding.length !== REQUIRED_EMBEDDING_DIMENSIONS)) {
        throw new EmbeddingProviderError(
          `The embedding model returned vectors that are not ${REQUIRED_EMBEDDING_DIMENSIONS} dimensions.`,
        );
      }
      return {
        embeddings,
        model,
        totalTokens: response.usage?.total_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof EmbeddingProviderError) throw error;
      const providerError = readProviderError(error);
      logger.error(
        {
          model,
          status: providerError.status,
          code: providerError.code,
          requestId: providerError.requestId,
          message: providerError.message,
        },
        "OpenAI embedding request failed",
      );
      if (isCreditBalanceError(providerError)) {
        throw new EmbeddingProviderError(EMBEDDING_CREDIT_BALANCE_MESSAGE, {
          cause: error,
        });
      }
      if (providerError.status === 401 || providerError.code === "invalid_api_key") {
        throw new EmbeddingProviderError(EMBEDDING_INVALID_API_KEY_MESSAGE, {
          cause: error,
        });
      }
      if (providerError.status === 403 || providerError.code === "model_not_found") {
        this.verifiedModel = null;
        this.resolvePromise = null;
        throw new EmbeddingProviderError(NO_ACCESSIBLE_EMBEDDING_MODEL_MESSAGE, {
          cause: error,
        });
      }
      throw new EmbeddingProviderError(
        `The embedding model request failed (${providerError.code ?? "unknown"}).`,
        { cause: error },
      );
    }
  }

  private async discoverAndVerifyModel(): Promise<string> {
    const listedModelIds = await this.listModelIds();
    const candidates = selectEmbeddingCandidates({
      configuredModel: this.configuredModel,
      listedModelIds,
    });

    if (candidates.length === 0) {
      logger.error(
        { listedModelCount: listedModelIds?.length ?? null },
        "OpenAI project has no accessible embedding model",
      );
      throw new EmbeddingProviderError(NO_ACCESSIBLE_EMBEDDING_MODEL_MESSAGE);
    }

    const failures: Array<{ model: string; reason: string }> = [];
    for (const model of candidates) {
      try {
        const response = await this.createEmbedding(["ok"], model);
        const embedding = response.data[0]?.embedding;
        if (embedding?.length === REQUIRED_EMBEDDING_DIMENSIONS) {
          if (this.configuredModel && model !== this.configuredModel) {
            logger.warn(
              { configuredModel: this.configuredModel, verifiedModel: model },
              "Configured OpenAI embedding model is unavailable; using verified accessible model",
            );
          } else {
            logger.info(
              { model, dimensions: embedding.length },
              "Verified OpenAI embedding model",
            );
          }
          return model;
        }
        failures.push({
          model,
          reason: `returned ${embedding?.length ?? 0} dimensions`,
        });
      } catch (error) {
        const providerError = readProviderError(error);
        failures.push({
          model,
          reason: providerError.code ?? providerError.message ?? "request failed",
        });
        if (
          providerError.status === 401 ||
          providerError.code === "invalid_api_key"
        ) {
          throw new EmbeddingProviderError(
            EMBEDDING_INVALID_API_KEY_MESSAGE,
            { cause: error },
          );
        }
        if (isCreditBalanceError(providerError)) {
          logger.error(
            {
              model,
              status: providerError.status,
              code: providerError.code,
              requestId: providerError.requestId,
            },
            "OpenAI embedding project credit balance is unavailable",
          );
          throw new EmbeddingProviderError(EMBEDDING_CREDIT_BALANCE_MESSAGE, {
            cause: error,
          });
        }
      }
    }

    logger.error(
      { candidates, failures },
      "Could not verify an accessible OpenAI embedding model",
    );
    throw new EmbeddingProviderError(NO_ACCESSIBLE_EMBEDDING_MODEL_MESSAGE);
  }

  private async listModelIds(): Promise<string[] | null> {
    try {
      const listed = this.client.models.list();
      const ids: string[] = [];
      if (listed && typeof listed === "object" && Symbol.asyncIterator in listed) {
        for await (const model of listed as AsyncIterable<{ id: string }>) {
          ids.push(model.id);
        }
        return ids;
      }
      const page = await (listed as Promise<{ data: Array<{ id: string }> }>);
      return page.data.map((item) => item.id);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Could not list OpenAI models; probing compatible embedding models",
      );
      return null;
    }
  }

  private async createEmbedding(texts: string[], model: string) {
    return this.client.embeddings.create({
      ...embeddingRequestOptions(model),
      input: texts,
    });
  }
}
