import OpenAI from "openai";
import { logger } from "../logger";
import {
  RuleAuthoringProviderError,
  type RuleAuthoringModelResult,
  type RuleAuthoringProvider,
  type RuleAuthoringProviderInput,
} from "./rule-authoring-provider";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "assistantMessage", "draft", "unresolvedFields"],
  properties: {
    status: { type: "string", enum: ["clarifying", "ready"] },
    assistantMessage: { type: "string" },
    draft: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "description",
            "promptTemplate",
            "priority",
            "requiresClarificationPrompt",
            "escalationTrigger",
            "isEnabled",
            "conditionOperator",
            "action",
            "categoryIds",
            "sourceIds",
            "audienceTargetIds",
          ],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            promptTemplate: { type: "string" },
            priority: { type: "integer" },
            requiresClarificationPrompt: { type: "string" },
            escalationTrigger: { type: "boolean" },
            isEnabled: { type: "boolean" },
            conditionOperator: { type: "string" },
            action: { type: "string" },
            categoryIds: { type: "array", items: { type: "string" } },
            sourceIds: { type: "array", items: { type: "string" } },
            audienceTargetIds: { type: "array", items: { type: "string" } },
          },
        },
        { type: "null" },
      ],
    },
    unresolvedFields: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

export class OpenAIRuleAuthoringProvider implements RuleAuthoringProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new RuleAuthoringProviderError(
        "Rule authoring is not configured. Set OPENAI_API_KEY to enable it.",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model = options?.model ?? process.env.OPENAI_MODEL ?? "gpt-5.6-luna";
  }

  async generate(
    input: RuleAuthoringProviderInput,
  ): Promise<RuleAuthoringModelResult> {
    const systemPrompt = [
      "You are a rule-authoring assistant for a support orchestration product.",
      "Turn the user's natural-language request into one structured rule.",
      "Ask one concise clarification question, grouping related missing values when safe,",
      "a name could match multiple available entities, or the user's intent is ambiguous.",
      "Never invent IDs, categories, sources, operators, or actions.",
      "Use only exact IDs and labels from the provided context.",
      "Attach audienceTargetIds only when the user explicitly asks to target an available audience target.",
      "A rule needs at least one category. Actions marked requiresSource need at least one source.",
      "Use priority 10 and isEnabled true unless the user explicitly asks otherwise.",
      "Set escalationTrigger true only for the escalate action.",
      "Set name and description to a concise human-readable rule sentence.",
      "Return status ready only when every required value is unambiguous and the draft is complete.",
      "When ready, ask the user to confirm the proposed rule.",
      `Available context: ${JSON.stringify(input.context)}`,
      `Current draft, if any: ${JSON.stringify(input.currentDraft ?? null)}`,
    ].join("\n");

    try {
      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...input.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ];
      const request = (model: string) =>
        this.client.chat.completions.create({
          model,
          messages,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "rule_authoring_result",
              strict: true,
              schema: RESPONSE_SCHEMA,
            },
          },
        });

      let completion;
      try {
        completion = await request(this.model);
      } catch (error) {
        const providerError = error as { code?: string; status?: number };
        if (
          providerError.code !== "model_not_found" ||
          this.model === "gpt-5-nano"
        ) {
          throw error;
        }

        logger.warn(
          {
            configuredModel: this.model,
            fallbackModel: "gpt-5-nano",
            status: providerError.status,
          },
          "Configured OpenAI model is unavailable; retrying with fallback model",
        );
        completion = await request("gpt-5-nano");
      }

      const content = completion.choices[0]?.message.content;
      if (!content) {
        throw new RuleAuthoringProviderError(
          "The rule-authoring model returned an empty response.",
        );
      }

      return JSON.parse(content) as RuleAuthoringModelResult;
    } catch (error) {
      if (error instanceof RuleAuthoringProviderError) throw error;

      const openAiError = error as {
        status?: number;
        code?: string;
        type?: string;
        message?: string;
        request_id?: string;
        error?: {
          code?: string;
          type?: string;
          message?: string;
        };
      };
      const providerMessage =
        openAiError.error?.message ??
        openAiError.message ??
        "Unknown OpenAI error";
      const providerCode =
        openAiError.error?.code ?? openAiError.code ?? "unknown";
      const providerType =
        openAiError.error?.type ?? openAiError.type ?? "unknown";

      logger.error(
        {
          model: this.model,
          status: openAiError.status,
          code: providerCode,
          type: providerType,
          requestId: openAiError.request_id,
          message: providerMessage,
        },
        "OpenAI rule-authoring request failed",
      );

      throw new RuleAuthoringProviderError(
        `The rule-authoring model request failed (${providerCode}).`,
        {
          cause: error,
        },
      );
    }
  }
}
