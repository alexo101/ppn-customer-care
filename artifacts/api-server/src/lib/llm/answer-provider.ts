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
  liveData?: {
    clientName: string;
    facts: Record<string, string | number | boolean>;
  };
  personAttributes: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type GroundedAnswerClaim = {
  text: string;
  evidenceQuote: string;
  citationIndex: number | null;
  format: "paragraph" | "step" | "bullet";
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

export type AnswerProviderDiagnostics = {
  status:
    | "complete"
    | "model_declined"
    | "missing_grounded_claims"
    | "invalid_structured_output"
    | "empty_output"
    | "truncated_output";
  finishReason: string | null;
  attempts: number;
  groundedClaimCount: number;
};

export type AnswerProviderResult = {
  responseText: string;
  answerable: boolean;
  replyLanguage?: string;
  model: string;
  totalTokens: number;
  promptAssembled: string;
  citations?: AnswerCitation[];
  groundedClaims?: GroundedAnswerClaim[];
  diagnostics?: AnswerProviderDiagnostics;
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
