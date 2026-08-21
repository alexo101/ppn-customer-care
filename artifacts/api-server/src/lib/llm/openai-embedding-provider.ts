import OpenAI from "openai";
import { logger } from "../logger";
import {
  EmbeddingProviderError,
  type EmbeddingProvider,
  type EmbeddingProviderResult,
} from "./embedding-provider";

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model: string;

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
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
      });
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
      throw new EmbeddingProviderError(
        `The embedding model request failed (${providerError.code ?? "unknown"}).`,
        { cause: error },
      );
    }
  }
}
