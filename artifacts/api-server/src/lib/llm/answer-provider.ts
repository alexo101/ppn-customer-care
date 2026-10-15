export type RetrievedChunk = {
  chunkId?: string;
  chunkIndex?: number;
  sourceId: string;
  sourceName: string;
  articleId?: string;
  articleName?: string;
  content: string;
  distance: number;
  kind?: "document";
  assets?: Array<{
    id: string;
    mimeType: string;
    altText: string;
    url: string;
  }>;
};

export type AnswerProviderInput = {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  retrievedChunks: RetrievedChunk[];
  personAttributes: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type AnswerCitation = {
  articleId: string;
  articleName: string;
  sourceId: string;
  sourceName: string;
  chunkId?: string;
  assetId?: string;
  excerpt?: string;
};

export type AnswerProviderResult = {
  responseText: string;
  answerable: boolean;
  replyLanguage?: string;
  model: string;
  totalTokens: number;
  promptAssembled: string;
  citations?: AnswerCitation[];
};

export interface AnswerProvider {
  generate(input: AnswerProviderInput): Promise<AnswerProviderResult>;
}

export class AnswerProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AnswerProviderError";
  }
}
