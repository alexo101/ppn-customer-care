export type RetrievedChunk = {
  chunkId?: string;
  chunkIndex?: number;
  sourceId: string;
  sourceName: string;
  content: string;
  distance: number;
  kind?: "document" | "api";
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
  categoryName: string;
  rule: {
    action: string;
    description: string;
    promptTemplate: string;
  } | null;
  retrievedChunks: RetrievedChunk[];
  personAttributes: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type AnswerProviderResult = {
  responseText: string;
  answerable: boolean;
  replyLanguage?: string;
  model: string;
  totalTokens: number;
  promptAssembled: string;
  citations?: Array<{
    sourceId: string;
    sourceName: string;
    chunkId?: string;
    assetId?: string;
    excerpt?: string;
  }>;
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
