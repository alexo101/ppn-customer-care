import type { AnswerProvider, RetrievedChunk } from "./llm";
import { AnswerProviderError } from "./llm";
import { resolutionFollowUp } from "./reply-locale";

type HistoryMessage = { sender: string; content: string };

export type GeneratedAnswer = {
  responseText: string;
  answerable: boolean;
  replyLanguage?: string;
  resolutionStatus: string;
  shouldAskResolution: boolean;
  model: string;
  totalTokens: number;
  promptAssembled: string;
  citations: NonNullable<import("./llm").AnswerProviderResult["citations"]>;
};

const GREETINGS_RESPONSES = [
  "Hello! I'm your AI support assistant. How can I help you today?",
  "Hi there! What can I assist you with?",
  "Welcome! I'm here to help. What do you need?",
];

const RESOLUTION_PHRASES = [
  "thanks",
  "thank you",
  "solved",
  "that works",
  "perfect",
  "got it",
  "great",
  "resolved",
];

const GREETING_PHRASES = ["hello", "hi", "hey", "good morning", "good afternoon"];

export function isDeterministicReply(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return isResolution(lower) || isGreeting(lower);
}

export function requiresAnswerProvider(message: string): boolean {
  return !isDeterministicReply(message);
}

export async function generateAnswer(
  message: string,
  history: HistoryMessage[],
  personAttributes: Record<string, unknown>,
  retrievedChunks: RetrievedChunk[],
  provider?: AnswerProvider,
  context: Record<string, unknown> = {},
): Promise<GeneratedAnswer> {
  const lower = message.toLowerCase().trim();
  if (isResolution(lower)) {
    return localAnswer(
      "Great to hear! If you need anything else, don't hesitate to reach out. Have a great day!\n\nWas this helpful? You can rate this answer below.",
      "resolved",
    );
  }
  if (isGreeting(lower)) {
    return localAnswer(
      GREETINGS_RESPONSES[Math.floor(Math.random() * GREETINGS_RESPONSES.length)],
      "active",
    );
  }

  if (!provider) {
    throw new AnswerProviderError(
      "Answer generation is not configured. Set OPENAI_API_KEY to enable it.",
    );
  }
  const result = await provider.generate({
    message,
    history: history.map((item) => ({
      role: item.sender === "assistant" ? "assistant" : "user",
      content: item.content,
    })),
    retrievedChunks,
    personAttributes,
    context,
  });
  const answerable = result.answerable !== false && retrievedChunks.length > 0;
  const userMessageCount = history.filter((item) => item.sender === "user").length;
  const shouldAskResolution = answerable && userMessageCount >= 2;
  const responseText =
    answerable && shouldAskResolution
      ? `${result.responseText}\n\n${resolutionFollowUp(result.replyLanguage, context.browser_language)}`
      : result.responseText;
  return {
    responseText,
    answerable,
    ...(result.replyLanguage ? { replyLanguage: result.replyLanguage } : {}),
    resolutionStatus: answerable
      ? shouldAskResolution
        ? "pending_resolution"
        : "active"
      : "pending_clarification",
    shouldAskResolution,
    model: result.model,
    totalTokens: result.totalTokens,
    promptAssembled: result.promptAssembled,
    citations: answerable ? (result.citations ?? []) : [],
  };
}

function localAnswer(responseText: string, resolutionStatus: string): GeneratedAnswer {
  return {
    responseText,
    answerable: true,
    resolutionStatus,
    shouldAskResolution: false,
    model: "deterministic-shortcut",
    totalTokens: 0,
    promptAssembled: "",
    citations: [],
  };
}

function isResolution(message: string): boolean {
  return RESOLUTION_PHRASES.some((keyword) => message.includes(keyword));
}

function isGreeting(message: string): boolean {
  return GREETING_PHRASES.some((keyword) => message.startsWith(keyword));
}
