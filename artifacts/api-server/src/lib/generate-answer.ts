import { performance } from "node:perf_hooks";
import type { AnswerProvider, RetrievedChunk } from "./llm";
import { AnswerProviderError } from "./llm";
import type { WelcomeMessageTranslator } from "./llm/openai-welcome-message-translator";
import {
  localizedCommunicationMessage,
  resolutionFollowUp,
  resolveReplyLocale,
  type ReplyLocale,
} from "./reply-locale";
import { translateCustomerTemplate } from "./welcome-message";

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
  timings: {
    provider_ms: number;
    language_alignment_ms: number;
  };
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

export async function alignReplyToAgentLanguage(
  text: string,
  agentLanguage: ReplyLocale,
  reportedLanguage: unknown,
  translator?: WelcomeMessageTranslator,
): Promise<string> {
  if (!text.trim()) return text;
  if (reportedLanguage == null || reportedLanguage === "") return text;
  if (resolveReplyLocale(reportedLanguage) === agentLanguage) return text;
  return translateCustomerTemplate(text, agentLanguage, text, translator);
}

export async function generateAnswer(
  message: string,
  history: HistoryMessage[],
  personAttributes: Record<string, unknown>,
  retrievedChunks: RetrievedChunk[],
  provider?: AnswerProvider,
  context: Record<string, unknown> = {},
  translator?: WelcomeMessageTranslator,
  liveData?: {
    clientName: string;
    facts: Record<string, string | number | boolean>;
  },
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
  const providerStartedAt = performance.now();
  const result = await provider.generate({
    message,
    history: history.map((item) => ({
      role: item.sender === "assistant" ? "assistant" : "user",
      content: item.content,
    })),
    retrievedChunks,
    liveData,
    personAttributes,
    context,
  });
  const providerMs = elapsedMs(providerStartedAt);
  const answerable =
    result.answerable !== false &&
    (retrievedChunks.length > 0 || Boolean(liveData));
  const userMessageCount = history.filter((item) => item.sender === "user").length;
  const shouldAskResolution = answerable && userMessageCount >= 2;
  const alignmentStartedAt = performance.now();
  const alignedText = answerable
    ? await alignReplyToAgentLanguage(
        result.responseText,
        language,
        result.replyLanguage,
        translator,
      )
    : result.responseText;
  const languageAlignmentMs = elapsedMs(alignmentStartedAt);
  const responseText =
    answerable && shouldAskResolution
      ? `${alignedText}\n\n${resolutionFollowUp(language)}`
      : alignedText;
  return {
    responseText,
    answerable,
    replyLanguage: language,
    resolutionStatus: answerable
      ? shouldAskResolution
        ? "pending_resolution"
        : "active"
      : "pending_clarification",
    shouldAskResolution,
    model: result.model,
    totalTokens: result.totalTokens,
    promptAssembled: liveData
      ? `[authorized live client values omitted; fields: ${Object.keys(liveData.facts).join(", ")}]`
      : result.promptAssembled,
    citations: answerable ? (result.citations ?? []) : [],
    timings: {
      provider_ms: providerMs,
      language_alignment_ms: languageAlignmentMs,
    },
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
    timings: { provider_ms: 0, language_alignment_ms: 0 },
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

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}
