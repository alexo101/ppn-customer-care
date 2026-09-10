import OpenAI from "openai";
import { logger } from "../logger";
import {
  EscalationSummaryProviderError,
  formatEscalationSummary,
  type EscalationSummaryInput,
  type EscalationSummaryParts,
  type EscalationSummaryProvider,
  type EscalationSummaryResult,
} from "./escalation-summary-provider";

const DEFAULT_SUMMARY_MODEL = "gpt-5-nano";

const SUMMARY_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "escalation_inbox_summary",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        customerRequest: { type: "string" },
        whatAiTried: { type: "string" },
        suggestedNextStep: { type: "string" },
      },
      required: ["customerRequest", "whatAiTried", "suggestedNextStep"],
    },
  },
} as const;

export class OpenAIEscalationSummaryProvider
  implements EscalationSummaryProvider
{
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new EscalationSummaryProviderError(
        "Escalation summaries are not configured. Set OPENAI_API_KEY to enable them.",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model =
      options?.model?.trim() ||
      process.env.ESCALATION_SUMMARY_MODEL?.trim() ||
      process.env.ANSWER_MODEL?.trim() ||
      DEFAULT_SUMMARY_MODEL;
  }

  async summarize(
    input: EscalationSummaryInput,
  ): Promise<EscalationSummaryResult> {
    const transcript = input.messages
      .map((message) => `${labelForSender(message.sender)}: ${message.content}`)
      .join("\n");
    const promptAssembled = [
      `Escalation reason: ${input.reason || "(none)"}`,
      `Category: ${input.category || "(none)"}`,
      `Subcategory: ${input.subcategory || "(none)"}`,
      `Previous AI answer: ${input.previousAnswer || "(none)"}`,
      `Context: ${JSON.stringify(input.context ?? {})}`,
      `Transcript:\n${transcript || "(empty)"}`,
    ].join("\n\n");
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: [
          "You write a short briefing for a human support specialist who is taking over an escalated conversation.",
          "Write in the same language as the customer messages.",
          "Return JSON with customerRequest, whatAiTried, and suggestedNextStep.",
          "customerRequest: one or two sentences describing what the customer wants.",
          "whatAiTried: what the AI already attempted or answered.",
          "suggestedNextStep: the most useful next action for the human agent.",
          "Do not invent facts that are not in the transcript or context.",
        ].join(" "),
      },
      { role: "user", content: promptAssembled },
    ];

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: SUMMARY_RESPONSE_FORMAT,
      });
      const rawResponse = response.choices[0]?.message.content?.trim() || "";
      const parts = parseEscalationSummaryResponse(rawResponse);
      if (
        !parts.customerRequest ||
        !parts.whatAiTried ||
        !parts.suggestedNextStep
      ) {
        throw new EscalationSummaryProviderError(
          "The summary model returned an incomplete response.",
        );
      }
      return {
        ...parts,
        summary: formatEscalationSummary(parts),
        model: response.model || this.model,
      };
    } catch (error) {
      if (error instanceof EscalationSummaryProviderError) throw error;
      logger.error({ err: error }, "Escalation summary generation failed");
      throw new EscalationSummaryProviderError(
        "Could not generate an escalation summary. Please try again.",
        { cause: error },
      );
    }
  }
}

function labelForSender(sender: string) {
  if (sender === "user") return "Customer";
  if (sender === "human") return "Human agent";
  return "AI agent";
}

export function parseEscalationSummaryResponse(
  value: string,
): EscalationSummaryParts {
  if (!value) {
    return { customerRequest: "", whatAiTried: "", suggestedNextStep: "" };
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      customerRequest:
        typeof parsed.customerRequest === "string"
          ? parsed.customerRequest.trim()
          : "",
      whatAiTried:
        typeof parsed.whatAiTried === "string" ? parsed.whatAiTried.trim() : "",
      suggestedNextStep:
        typeof parsed.suggestedNextStep === "string"
          ? parsed.suggestedNextStep.trim()
          : "",
    };
  } catch {
    return { customerRequest: "", whatAiTried: "", suggestedNextStep: "" };
  }
}
