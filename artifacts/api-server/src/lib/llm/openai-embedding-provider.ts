import OpenAI from "openai";
import { logger } from "../logger";
import {
  EmbeddingProviderError,
  type EmbeddingProvider,
  type EmbeddingProviderResult,
} from "./embedding-provider";

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new EmbeddingProviderError(
        "Knowledge retrieval is not configured. Set OPENAI_API_KEY to enable it.",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model =
      options?.model ??
      process.env.EMBEDDING_MODEL ??
      "text-embedding-3-small";
  }

  async embed(texts: string[]): Promise<EmbeddingProviderResult> {
    if (texts.length === 0) {
      return { embeddings: [], model: this.model, totalTokens: 0 };
    }

    try {
      const response = await this.createEmbedding(texts, this.model);
      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
      if (embeddings.length !== texts.length) {
        throw new EmbeddingProviderError(
          "The embedding model returned an incomplete response.",
        );
      }
      return {
        embeddings,
        model: response.model || this.model,
        totalTokens: response.usage?.total_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof EmbeddingProviderError) throw error;
      const providerError = error as {
        status?: number;
        code?: string;
        message?: string;
        request_id?: string;
      };
      const fallbackModel = await this.findFallbackModel(providerError);
      if (fallbackModel) {
        logger.warn(
          {
            configuredModel: this.model,
            fallbackModel,
            status: providerError.status,
            code: providerError.code,
          },
          "Configured OpenAI embedding model is unavailable; retrying with accessible model",
        );
        let response;
        try {
          response = await this.createEmbedding(texts, fallbackModel);
        } catch (fallbackError) {
          const fallbackProviderError = fallbackError as {
            status?: number;
            code?: string;
            message?: string;
          };
          logger.error(
            {
              model: fallbackModel,
              status: fallbackProviderError.status,
              code: fallbackProviderError.code,
              message: fallbackProviderError.message,
            },
            "OpenAI fallback embedding request failed",
          );
          throw new EmbeddingProviderError(
            `The fallback embedding model request failed (${fallbackProviderError.code ?? "unknown"}).`,
            { cause: fallbackError },
          );
        }
        const embeddings = response.data
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding);
        if (embeddings.length !== texts.length) {
          throw new EmbeddingProviderError(
            "The fallback embedding model returned an incomplete response.",
          );
        }
        this.model = fallbackModel;
        return {
          embeddings,
          model: response.model || fallbackModel,
          totalTokens: response.usage?.total_tokens ?? 0,
        };
      }

      logger.error(
        {
          model: this.model,
          status: providerError.status,
          code: providerError.code,
          requestId: providerError.request_id,
          message: providerError.message,
        },
        "OpenAI embedding request failed",
      );
      // #region agent log
      let accessibleEmbeddingModels: string[] = [];
      try {
        const listed = await this.client.models.list();
        accessibleEmbeddingModels = listed.data
          .map((item) => item.id)
          .filter((id) => /embed/i.test(id));
      } catch {
        accessibleEmbeddingModels = ["__list_failed__"];
      }
      fetch("http://127.0.0.1:7743/ingest/fbcc6644-f5ef-42d5-8361-4b0eb31d88ad", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "65a883",
        },
        body: JSON.stringify({
          sessionId: "65a883",
          runId: "pre-fix",
          hypothesisId: "A",
          location: "openai-embedding-provider.ts:embed-catch",
          message: "OpenAI embedding request failed",
          data: {
            configuredModel: this.model,
            status: providerError.status,
            code: providerError.code,
            message: providerError.message,
            accessibleEmbeddingModels,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw new EmbeddingProviderError(
        `The embedding model request failed (${providerError.code ?? "unknown"}).`,
        { cause: error },
      );
    }
  }

  private async createEmbedding(texts: string[], model: string) {
    return this.client.embeddings.create({
      model,
      input: texts,
      ...(model === "text-embedding-3-large" ? { dimensions: 1536 } : {}),
    });
  }

  private async findFallbackModel(providerError: {
    status?: number;
    code?: string;
  }): Promise<string | null> {
    if (providerError.status !== 403 || providerError.code !== "model_not_found") {
      return null;
    }

    try {
      const listed = await this.client.models.list();
      const accessible = new Set(
        listed.data
          .map((item) => item.id)
          .filter((id) => /embed/i.test(id)),
      );
      const candidates = [
        "text-embedding-ada-002",
        "text-embedding-3-large",
        "text-embedding-3-small",
      ];
      return candidates.find((candidate) => candidate !== this.model && accessible.has(candidate)) ?? null;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Could not discover accessible OpenAI embedding models",
      );
      return null;
    }
  }
}
