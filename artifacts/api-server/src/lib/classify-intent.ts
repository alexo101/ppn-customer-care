import type { ClassificationResult } from "@workspace/api-zod";
import type { ClassificationProvider } from "./llm";
import { ClassificationProviderError } from "./llm";

type Category = {
  id: string;
  name: string;
  description: string;
  examples: string[];
  keywords: string[];
};

type Message = { sender: string; content: string };

export type IntentClassificationMetadata = {
  classification: ClassificationResult;
  probabilities: Array<{ categoryId: string; probability: number }>;
  model: string;
  totalTokens: number;
};

const RESOLUTION = [
  "thanks",
  "thank you",
  "solved",
  "that works",
  "perfect",
  "got it",
  "great",
  "resolved",
];
const GREETING = ["hello", "hi", "hey", "good morning", "good afternoon"];

export function isIntentShortcut(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return (
    RESOLUTION.some((keyword) => lower.includes(keyword)) ||
    GREETING.some((keyword) => lower.startsWith(keyword))
  );
}

export async function classifyIntent(
  message: string,
  history: Message[],
  categories: Category[],
  provider?: ClassificationProvider,
  context: Record<string, unknown> = {},
): Promise<ClassificationResult> {
  const result = await classifyIntentWithMetadata(
    message,
    history,
    categories,
    provider,
    context,
  );
  return result.classification;
}

export async function classifyIntentWithMetadata(
  message: string,
  history: Message[],
  categories: Category[],
  provider?: ClassificationProvider,
  context: Record<string, unknown> = {},
): Promise<IntentClassificationMetadata> {
  const lower = message.toLowerCase().trim();
  if (RESOLUTION.some((keyword) => lower.includes(keyword))) {
    return localResult("Resolution", 0.95);
  }
  if (GREETING.some((keyword) => lower.startsWith(keyword))) {
    return localResult("Greeting", 0.9);
  }

  if (!provider) {
    throw new ClassificationProviderError(
      "Intent classification is not configured. Set OPENAI_API_KEY to enable it.",
    );
  }
  const modelResult = await provider.classify({
    message,
    history: history.map((item) => ({
      role: item.sender === "assistant" ? "assistant" : "user",
      content: item.content,
    })),
    categories,
    context,
  });
  const validIds = new Set(categories.map((category) => category.id));
  const byId = new Map(
    modelResult.categories
      .filter((item) => validIds.has(item.categoryId))
      .map((item) => [
        item.categoryId,
        {
          categoryId: item.categoryId,
          probability: clampProbability(item.probability),
        },
      ]),
  );
  const ranked = categories
    .map((category) => ({
      category,
      probability: byId.get(category.id)?.probability ?? 0,
    }))
    .sort((a, b) => b.probability - a.probability);
  const primary = ranked[0];
  const classification: ClassificationResult = {
    primaryCategory: primary?.category.name ?? "General",
    primaryCategoryId: primary?.category.id ?? "",
    confidence: primary?.probability ?? 0,
    secondaryCategories: ranked
      .slice(1, 3)
      .filter((item) => item.probability > 0)
      .map((item) => item.category.name),
    entities: modelResult.entities,
    rule: "None",
    ruleId: "",
  };
  return {
    classification,
    probabilities: ranked.map((item) => ({
      categoryId: item.category.id,
      probability: item.probability,
    })),
    model: modelResult.model,
    totalTokens: modelResult.totalTokens,
  };
}

function localResult(
  primaryCategory: string,
  confidence: number,
): IntentClassificationMetadata {
  return {
    classification: {
      primaryCategory,
      primaryCategoryId: "",
      confidence,
      secondaryCategories: [],
      entities: {},
      rule: "None",
      ruleId: "",
    },
    probabilities: [],
    model: "deterministic-shortcut",
    totalTokens: 0,
  };
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
