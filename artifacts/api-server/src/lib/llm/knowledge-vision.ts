import OpenAI from "openai";
import { AnswerProviderError } from "./answer-provider";

const MAX_IMAGE_DATA_URL_BYTES = 6 * 1024 * 1024;

let client: OpenAI | undefined;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AnswerProviderError(
      "Image understanding is not configured. Set OPENAI_API_KEY to describe screenshots.",
    );
  }
  client ??= new OpenAI({ apiKey });
  return client;
}

export async function describeKnowledgeImage(input: {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  altText?: string;
}): Promise<string> {
  const dataUrl = `data:${input.mimeType};base64,${input.buffer.toString("base64")}`;
  if (dataUrl.length > MAX_IMAGE_DATA_URL_BYTES) {
    return input.altText?.trim() || "Screenshot attached to the documentation.";
  }
  const response = await getClient().chat.completions.create({
    model: process.env.KNOWLEDGE_VISION_MODEL?.trim() || "gpt-4o-mini",
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content:
          "Describe this documentation screenshot for semantic search. Include visible text, UI labels, error messages, controls, and the user task it illustrates. Be concise and factual. Do not infer secrets.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: input.altText?.trim()
              ? `Author-provided alt text: ${input.altText.trim()}`
              : "Describe the screenshot.",
          },
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
        ],
      },
    ],
  });
  return (
    response.choices[0]?.message.content?.trim() ||
    input.altText?.trim() ||
    "Screenshot attached to the documentation."
  );
}
