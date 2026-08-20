import OpenAI from "openai";
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
    this.model = options?.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  }

  async generate(
    input: RuleAuthoringProviderInput,
  ): Promise<RuleAuthoringModelResult> {
    const systemPrompt = [
      "You are a rule-authoring assistant for a support orchestration product.",
      "Turn the user's natural-language request into one structured rule.",
      "Ask one focused clarification question whenever a required value is missing,",
      "a name could match multiple available entities, or the user's intent is ambiguous.",
      "Never invent IDs, categories, sources, operators, or actions.",
      "Use only exact IDs and labels from the provided context.",
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
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          ...input.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "rule_authoring_result",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
      });

      const content = completion.choices[0]?.message.content;
      if (!content) {
        throw new RuleAuthoringProviderError(
          "The rule-authoring model returned an empty response.",
        );
      }

      return JSON.parse(content) as RuleAuthoringModelResult;
    } catch (error) {
      if (error instanceof RuleAuthoringProviderError) throw error;
      throw new RuleAuthoringProviderError(
        "The rule-authoring model request failed.",
        {
          cause: error,
        },
      );
    }
  }
}
