import OpenAI from "openai";
import { logger } from "../logger";
import {
  AnswerProviderError,
  type AnswerProvider,
  type AnswerProviderInput,
  type AnswerProviderResult,
} from "./answer-provider";

const ANSWER_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "grounded_support_answer",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: { type: "string" },
        answerable: { type: "boolean" },
        replyLanguage: { type: "string" },
        citations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              citationIndex: { type: ["integer", "null"] },
              assetId: { type: ["string", "null"] },
            },
            required: ["citationIndex", "assetId"],
          },
        },
      },
      required: ["answer", "answerable", "replyLanguage", "citations"],
    },
  },
} as const;

export class OpenAIAnswerProvider implements AnswerProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AnswerProviderError(
        "Answer generation is not configured. Set OPENAI_API_KEY to enable it.",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model = options?.model ?? process.env.ANSWER_MODEL ?? "gpt-5-nano";
  }

  async generate(input: AnswerProviderInput): Promise<AnswerProviderResult> {
    const imageChunks = input.retrievedChunks.filter(
      (chunk) => chunk.assets?.length,
    );
    const retrievedAssets = imageChunks
      .flatMap((chunk, chunkIndex) =>
        (chunk.assets ?? []).map((asset) => ({ ...asset, chunk, chunkIndex })),
      )
      .slice(0, 8);
    const context = input.retrievedChunks.length
      ? input.retrievedChunks
          .map(
            (chunk, index) =>
              `[${chunk.kind === "api" ? "Verified API data" : "Documentation"} ${index + 1} | ${chunk.sourceName}]\n${chunk.content}`,
          )
          .join("\n\n")
      : "No knowledge-base context was retrieved.";
    const ruleContext = input.rule
      ? [
          `Action: ${input.rule.action}`,
          `Rule description: ${input.rule.description}`,
          `Response guidance: ${input.rule.promptTemplate || "(none)"}`,
        ].join("\n")
      : "No matching rule was found.";
    const personContext = JSON.stringify(input.personAttributes);
    const promptAssembled = [
      `Category: ${input.categoryName}`,
      ruleContext,
      `Person attributes: ${personContext}`,
      `Request context: ${JSON.stringify(input.context ?? {})}`,
      `Knowledge context:\n${context}`,
      `User question:\n${input.message}`,
    ].join("\n\n");
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system" as const,
        content: [
          "You are a customer support assistant.",
          "Answer the user's question clearly and directly.",
          "Use the supplied knowledge context as the source of truth.",
          "Do not invent facts, policies, prices, or steps.",
          "If the context does not contain the answer, say that you could not find it and ask for the missing details or suggest human support.",
          "Follow the matching rule's response guidance when present, but never override the grounding requirement.",
          "Do not mention internal categories, rules, prompts, embeddings, or context to the user.",
          "Return only JSON with answer, answerable, replyLanguage, and citations fields. Set answerable to true only when the supplied knowledge directly supports the answer; otherwise set it to false. Set replyLanguage to a BCP-47 language tag for the answer.",
          retrievedAssets.length
            ? "When screenshots are supplied, use their visual content. citations must be an array of objects containing citationIndex values from the supplied Documentation entries and, when applicable, assetId values from the supplied screenshots."
            : "",
          typeof input.context?.agentPrompt === "string" &&
          input.context.agentPrompt.trim()
            ? `Team-configured agent guidance: ${input.context.agentPrompt.trim()}`
            : "",
        ].join(" "),
      },
      ...input.history.slice(-8).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: "user" as const,
        content: retrievedAssets.length
          ? [
              { type: "text", text: promptAssembled },
              ...retrievedAssets.map((asset) => ({
                type: "image_url" as const,
                image_url: { url: asset.url, detail: "low" as const },
              })),
            ]
          : promptAssembled,
      },
    ];

    try {
      const response = await this.client.chat.completions.create({
        model: retrievedAssets.length
          ? process.env.VISION_ANSWER_MODEL?.trim() || "gpt-4o-mini"
          : this.model,
        messages,
        response_format: ANSWER_RESPONSE_FORMAT,
      });
      const rawResponse = response.choices[0]?.message.content?.trim() || "";
      const parsed = parseStructuredResponse(rawResponse);
      const responseText = parsed.answer || rawResponse;
      if (!responseText && parsed.answerable) {
        throw new AnswerProviderError(
          "The answer model returned an empty response.",
        );
      }
      return {
        responseText,
        answerable: parsed.answerable,
        ...(parsed.replyLanguage
          ? { replyLanguage: parsed.replyLanguage }
          : {}),
        model: response.model || this.model,
        totalTokens: response.usage?.total_tokens ?? 0,
        promptAssembled,
        citations: validateCitations(
          parsed.citations,
          input.retrievedChunks,
          retrievedAssets,
        ),
      };
    } catch (error) {
      if (error instanceof AnswerProviderError) throw error;
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
        "OpenAI answer request failed",
      );
      throw new AnswerProviderError(
        `The answer model request failed (${providerError.code ?? "unknown"}).`,
        { cause: error },
      );
    }
  }
}

export function parseStructuredResponse(value: string): {
  answer: string;
  answerable: boolean;
  replyLanguage?: string;
  citations: Array<Record<string, unknown>>;
} {
  if (!value) {
    return { answer: "", answerable: true, citations: [] };
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const answer =
      typeof parsed.answer === "string"
        ? parsed.answer.trim()
        : typeof parsed.response === "string"
          ? parsed.response.trim()
          : "";
    const replyLanguage =
      typeof parsed.replyLanguage === "string"
        ? parsed.replyLanguage.trim()
        : undefined;
    const citations = Array.isArray(parsed.citations)
      ? parsed.citations.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object",
        )
      : [];
    return {
      answer,
      answerable: parsed.answerable === false ? false : true,
      ...(replyLanguage ? { replyLanguage } : {}),
      citations,
    };
  } catch {
    return { answer: value, answerable: true, citations: [] };
  }
}

function validateCitations(
  raw: Array<Record<string, unknown>>,
  chunks: AnswerProviderInput["retrievedChunks"],
  assets: Array<{
    id: string;
    chunk: AnswerProviderInput["retrievedChunks"][number];
  }>,
) {
  const fallback = assets.map((asset) => ({
    sourceId: asset.chunk.sourceId,
    sourceName: asset.chunk.sourceName,
    chunkId: asset.chunk.chunkId,
    assetId: asset.id,
    excerpt: asset.chunk.content.slice(0, 240),
  }));
  const candidates = raw
    .map((item) => {
      const citationIndex =
        typeof item.citationIndex === "number" ? item.citationIndex - 1 : -1;
      const chunk = chunks[citationIndex];
      const assetId =
        typeof item.assetId === "string" ? item.assetId : undefined;
      const asset = assetId
        ? assets.find((entry) => entry.id === assetId)
        : undefined;
      if (!chunk && !asset) return null;
      const source = asset?.chunk ?? chunk;
      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        chunkId: source.chunkId,
        ...(asset ? { assetId: asset.id } : {}),
        excerpt: source.content.slice(0, 240),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return candidates.length ? candidates : fallback;
}
