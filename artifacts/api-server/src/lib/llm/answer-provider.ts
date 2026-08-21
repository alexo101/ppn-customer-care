export type RetrievedChunk = {
  sourceId: string;
  sourceName: string;
  content: string;
  distance: number;
  kind?: "document" | "api";
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
  model: string;
  totalTokens: number;
  promptAssembled: string;
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
