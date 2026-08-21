export type ClassificationCategory = {
  id: string;
  name: string;
  description: string;
  examples: string[];
  keywords: string[];
};

export type ClassificationProviderInput = {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  categories: ClassificationCategory[];
  context?: Record<string, unknown>;
};

export type ClassificationProviderResult = {
  categories: Array<{ categoryId: string; probability: number }>;
  entities: Record<string, unknown>;
  model: string;
  totalTokens: number;
};

export interface ClassificationProvider {
  classify(
    input: ClassificationProviderInput,
  ): Promise<ClassificationProviderResult>;
}

export class ClassificationProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClassificationProviderError";
  }
}
