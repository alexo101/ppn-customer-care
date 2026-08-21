import { describe, expect, it, vi } from "vitest";
import { classifyIntentWithMetadata } from "./classify-intent";
import type { ClassificationProvider } from "./llm";

const categories = [
  {
    id: "billing",
    name: "Billing",
    description: "Payment questions",
    examples: [],
    keywords: ["invoice"],
  },
  {
    id: "technical",
    name: "Technical",
    description: "Product issues",
    examples: [],
    keywords: ["bug"],
  },
];

describe("classifyIntentWithMetadata", () => {
  it("selects the highest probability category and keeps ranked probabilities", async () => {
    const provider: ClassificationProvider = {
      classify: vi.fn().mockResolvedValue({
        categories: [
          { categoryId: "billing", probability: 0.31 },
          { categoryId: "technical", probability: 0.88 },
        ],
        entities: { order_id: "123" },
        model: "gpt-5-nano",
        totalTokens: 42,
      }),
    };

    const result = await classifyIntentWithMetadata(
      "I found a bug",
      [],
      categories,
      provider,
    );

    expect(result.classification.primaryCategoryId).toBe("technical");
    expect(result.classification.confidence).toBe(0.88);
    expect(result.probabilities[0]).toEqual({
      categoryId: "technical",
      probability: 0.88,
    });
    expect(result.classification.entities).toEqual({ order_id: "123" });
  });

  it("ignores category IDs invented by the model", async () => {
    const provider: ClassificationProvider = {
      classify: vi.fn().mockResolvedValue({
        categories: [
          { categoryId: "invented", probability: 1 },
          { categoryId: "billing", probability: 0.4 },
        ],
        entities: {},
        model: "gpt-5-nano",
        totalTokens: 1,
      }),
    };

    const result = await classifyIntentWithMetadata(
      "Question",
      [],
      categories,
      provider,
    );

    expect(result.classification.primaryCategoryId).toBe("billing");
    expect(result.classification.confidence).toBe(0.4);
    expect(result.probabilities).toHaveLength(2);
  });

  it("does not call the provider for greetings", async () => {
    const classify = vi.fn();
    const provider: ClassificationProvider = { classify };

    const result = await classifyIntentWithMetadata(
      "Hello there",
      [],
      categories,
      provider,
    );

    expect(result.classification.primaryCategory).toBe("Greeting");
    expect(classify).not.toHaveBeenCalled();
  });

  it("propagates classification provider failures", async () => {
    const error = new Error("provider failed");
    const provider: ClassificationProvider = {
      classify: vi.fn().mockRejectedValue(error),
    };

    await expect(
      classifyIntentWithMetadata("Question", [], categories, provider),
    ).rejects.toBe(error);
  });
});
