import OpenAI from "openai";
import { logger } from "../logger";

export const DEFAULT_WELCOME_MESSAGE_MODEL = "gpt-5-nano";

export type WelcomeMessageTranslator = {
  translate(template: string, locale: string): Promise<string>;
};

export class OpenAIWelcomeMessageTranslator
  implements WelcomeMessageTranslator
{
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Welcome-message translation is not configured. Set OPENAI_API_KEY to enable it.",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model =
      options?.model?.trim() ||
      process.env.WELCOME_MESSAGE_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      DEFAULT_WELCOME_MESSAGE_MODEL;
  }

  async translate(template: string, locale: string): Promise<string> {
    const placeholders = [
      ...new Set(template.match(/\{[a-zA-Z0-9_]+\}/g) ?? []),
    ];
    const placeholderTokens = new Map(
      placeholders.map((placeholder, index) => [
        placeholder,
        `__SUPPORT_PLACEHOLDER_${index}__`,
      ]),
    );
    const protectedTemplate = placeholders.reduce(
      (message, placeholder) =>
        message.replaceAll(placeholder, placeholderTokens.get(placeholder)!),
      template,
    );
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "Translate the supplied customer-support message into the requested language. Return only the translated message. Preserve every __SUPPORT_PLACEHOLDER_N__ token exactly, including spelling and position. Preserve URLs, citations, names, and identifiers.",
      },
      {
        role: "user",
        content: `Required customer communication language: ${locale}\n\nMessage:\n${protectedTemplate}`,
      },
    ];
    const request = (model: string) =>
      this.client.chat.completions.create({ model, messages });

    let response;
    try {
      response = await request(this.model);
    } catch (error) {
      if (
        !isModelAccessError(error) ||
        this.model === DEFAULT_WELCOME_MESSAGE_MODEL
      ) {
        throw error;
      }
      logger.warn(
        {
          err: error,
          configuredModel: this.model,
          fallbackModel: DEFAULT_WELCOME_MESSAGE_MODEL,
        },
        "Configured welcome-message model is unavailable; retrying with fallback model",
      );
      response = await request(DEFAULT_WELCOME_MESSAGE_MODEL);
    }
    const translated = response.choices[0]?.message.content?.trim() ?? "";
    if (
      placeholders.some(
        (placeholder) =>
          !translated.includes(placeholderTokens.get(placeholder)!),
      )
    ) {
      throw new Error("Translated message lost a required placeholder.");
    }
    return placeholders.reduce(
      (message, placeholder) =>
        message.replaceAll(placeholderTokens.get(placeholder)!, placeholder),
      translated,
    );
  }
}

function isModelAccessError(error: unknown): boolean {
  const providerError = error as {
    code?: string;
    status?: number;
  };
  return (
    providerError.code === "model_not_found" ||
    providerError.status === 403 ||
    providerError.status === 404
  );
}
