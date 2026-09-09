import OpenAI from "openai";

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
      options?.model ??
      process.env.WELCOME_MESSAGE_MODEL ??
      process.env.ANSWER_MODEL ??
      process.env.OPENAI_MODEL ??
      "gpt-5-nano";
  }

  async translate(template: string, locale: string): Promise<string> {
    const protectedTemplate = template
      .replaceAll("{user_name}", "__WELCOME_USER_NAME__")
      .replaceAll("{agent_name}", "__WELCOME_AGENT_NAME__");
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "Translate the supplied customer-support welcome message into the requested browser locale. Return only the translated message. Preserve __WELCOME_USER_NAME__ and __WELCOME_AGENT_NAME__ exactly, including spelling and position.",
        },
        {
          role: "user",
          content: `Browser locale: ${locale}\n\nMessage:\n${protectedTemplate}`,
        },
      ],
    });
    const translated = response.choices[0]?.message.content?.trim() ?? "";
    if (
      !translated.includes("__WELCOME_USER_NAME__") ||
      !translated.includes("__WELCOME_AGENT_NAME__")
    ) {
      throw new Error("Translated welcome message lost a required placeholder.");
    }
    return translated
      .replaceAll("__WELCOME_USER_NAME__", "{user_name}")
      .replaceAll("__WELCOME_AGENT_NAME__", "{agent_name}");
  }
}
