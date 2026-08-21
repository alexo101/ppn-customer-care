export type EmbeddingProviderResult = {
  embeddings: number[][];
  model: string;
  totalTokens: number;
};

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<EmbeddingProviderResult>;
}

export class EmbeddingProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmbeddingProviderError";
  }
}
