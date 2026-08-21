import OpenAI from "openai";
import { logger } from "../logger";
import {
  ClassificationProviderError,
  type ClassificationProvider,
  type ClassificationProviderInput,
  type ClassificationProviderResult,
} from "./classification-provider";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["categories", "entities"],
  properties: {
    categories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["categoryId", "probability"],
        properties: {
          categoryId: { type: "string" },
          probability: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    entities: {
      type: "object",
      additionalProperties: false,
      required: [
        "email",
        "detected_uuid",
        "order_id",
        "product_name",
      ],
      properties: {
        email: { anyOf: [{ type: "string" }, { type: "null" }] },
        detected_uuid: { anyOf: [{ type: "string" }, { type: "null" }] },
        order_id: { anyOf: [{ type: "string" }, { type: "null" }] },
        product_name: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    },
  },
} as const;

export class OpenAIClassificationProvider implements ClassificationProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ClassificationProviderError(
        "Intent classification is not configured. Set OPENAI_API_KEY to enable it.",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model = options?.model ?? process.env.CLASSIFICATION_MODEL ?? "gpt-5-nano";
  }

  getModel(): string {
    return this.model;
  }

  async classify(
    input: ClassificationProviderInput,
  ): Promise<ClassificationProviderResult> {
    const categoryList = input.categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      examples: category.examples,
      keywords: category.keywords,
    }));
    const systemPrompt = [
      "You classify customer support messages into the supplied intent categories.",
      "Return every supplied category exactly once with an independent probability from 0 to 1.",
      "The probabilities represent how likely the message belongs to each category; they do not need to sum to 1.",
      "Use only category IDs from the supplied list. Never invent IDs.",
      "Extract only obvious entities such as email addresses, UUIDs, order IDs, or product names.",
      `Available categories: ${JSON.stringify(categoryList)}`,
      `User context: ${JSON.stringify(input.context ?? {})}`,
    ].join("\n");
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...input.history.slice(-8).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user" as const, content: input.message },
    ];

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "intent_classification",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
      });
      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new ClassificationProviderError(
          "The classification model returned an empty response.",
        );
      }
      const parsed = JSON.parse(content) as {
        categories?: Array<{ categoryId?: unknown; probability?: unknown }>;
        entities?: unknown;
      };
      return {
        categories: Array.isArray(parsed.categories)
          ? parsed.categories.map((item) => ({
              categoryId: String(item.categoryId ?? ""),
              probability: Number(item.probability),
            }))
          : [],
        entities:
          parsed.entities &&
          typeof parsed.entities === "object" &&
          !Array.isArray(parsed.entities)
            ? (parsed.entities as Record<string, unknown>)
            : {},
        model: response.model || this.model,
        totalTokens: response.usage?.total_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof ClassificationProviderError) throw error;
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
        "OpenAI classification request failed",
      );
      throw new ClassificationProviderError(
        `The classification model request failed (${providerError.code ?? "unknown"}).`,
        { cause: error },
      );
    }
  }
}
