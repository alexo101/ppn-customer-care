import OpenAI from "openai";
import { logger } from "../logger";
import {
  AnswerProviderError,
  type AnswerProvider,
  type AnswerProviderInput,
  type AnswerProviderResult,
} from "./answer-provider";

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
    const messages = [
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
          typeof input.context?.agentPrompt === "string" && input.context.agentPrompt.trim()
            ? `Team-configured agent guidance: ${input.context.agentPrompt.trim()}`
            : "",
        ].join(" "),
      },
      ...input.history.slice(-8).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user" as const, content: promptAssembled },
    ];

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
      });
      const responseText = response.choices[0]?.message.content?.trim();
      if (!responseText) {
        throw new AnswerProviderError(
          "The answer model returned an empty response.",
        );
      }
      return {
        responseText,
        model: response.model || this.model,
        totalTokens: response.usage?.total_tokens ?? 0,
        promptAssembled,
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
