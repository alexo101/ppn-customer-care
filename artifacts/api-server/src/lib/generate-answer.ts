import type { AnswerProvider, RetrievedChunk } from "./llm";
import { AnswerProviderError } from "./llm";
import {
  localizedCommunicationMessage,
  resolutionFollowUp,
  resolveReplyLocale,
} from "./reply-locale";

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
const LOCALIZED_GREETING_PHRASES = ["hola", "ciao", "bonjour", "bonsoir"];

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
  const language = resolveReplyLocale(context.agent_language);
  if (isResolution(lower)) {
    return localAnswer(
      localizedCommunicationMessage("resolved", language),
      "resolved",
    );
  }
  if (isGreeting(lower)) {
    return localAnswer(
      localizedCommunicationMessage("greeting", language),
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
      ? `${result.responseText}\n\n${resolutionFollowUp(language)}`
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
  return RESOLUTION_PHRASES.some((keyword) => message.includes(keyword)) ||
    ["gracias", "ya está", "risolto", "grazie", "résolu", "merci"].some((keyword) => message.includes(keyword));
}

function isGreeting(message: string): boolean {
  return GREETING_PHRASES.some((keyword) => message.startsWith(keyword)) ||
    LOCALIZED_GREETING_PHRASES.some((keyword) => message.startsWith(keyword));
}
