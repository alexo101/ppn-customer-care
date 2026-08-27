import type { ClassificationResult } from "@workspace/api-zod";
import { normalizeAction } from "./rule-engine";
import type { AnswerProvider, RetrievedChunk } from "./llm";
import { AnswerProviderError } from "./llm";

type Rule = {
  action: string;
  description: string;
  promptTemplate: string;
  requiresClarificationPrompt: string;
  escalationTrigger: boolean;
};

type HistoryMessage = { sender: string; content: string };

export type GeneratedAnswer = {
  responseText: string;
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

export function requiresAnswerProvider(
  message: string,
  rule: Rule | null,
): boolean {
  const lower = message.toLowerCase().trim();
  if (isResolution(lower) || isGreeting(lower)) return false;
  if (!rule) return true;
  const action = normalizeAction(rule.action);
  return action !== "escalate" && action !== "ask_clarification";
}

export async function generateAnswer(
  message: string,
  classification: ClassificationResult,
  rule: Rule | null,
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
  if (rule) {
    const action = normalizeAction(rule.action);
    if (rule.escalationTrigger || action === "escalate") {
      return localAnswer(
        "I understand this is an important issue. I'm escalating this to a human support agent who will assist you shortly. Please stay on the line.",
        "escalated",
      );
    }
    if (action === "ask_clarification") {
      return localAnswer(
        rule.requiresClarificationPrompt
          ? renderTemplate(rule.requiresClarificationPrompt, personAttributes)
          : `I need a bit more detail about your ${classification.primaryCategory} request before I can continue.`,
        "pending_clarification",
      );
    }
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
    categoryName: classification.primaryCategory,
    rule: rule
      ? {
          action: rule.action,
          description: rule.description,
          promptTemplate: renderTemplate(rule.promptTemplate, personAttributes),
        }
      : null,
    retrievedChunks,
    personAttributes,
    context,
  });
  const userMessageCount = history.filter((item) => item.sender === "user").length;
  const shouldAskResolution = userMessageCount >= (rule ? 2 : 3);
  const responseText = shouldAskResolution
    ? `${result.responseText}\n\nDoes this answer your question? Please let me know if you need further assistance.`
    : result.responseText;
  return {
    responseText,
    resolutionStatus: shouldAskResolution ? "pending_resolution" : "active",
    shouldAskResolution,
    model: result.model,
    totalTokens: result.totalTokens,
    promptAssembled: result.promptAssembled,
    citations: result.citations ?? [],
  };
}

function localAnswer(responseText: string, resolutionStatus: string): GeneratedAnswer {
  return {
    responseText,
    resolutionStatus,
    shouldAskResolution: false,
    model: "deterministic-shortcut",
    totalTokens: 0,
    promptAssembled: "",
    citations: [],
  };
}

function renderTemplate(
  template: string,
  attributes: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = attributes[key];
    return value == null ? "" : String(value);
  });
}

function isResolution(message: string): boolean {
  return [
    "thanks",
    "thank you",
    "solved",
    "that works",
    "perfect",
    "got it",
    "great",
    "resolved",
  ].some((keyword) => message.includes(keyword));
}

function isGreeting(message: string): boolean {
  return ["hello", "hi", "hey", "good morning", "good afternoon"].some(
    (keyword) => message.startsWith(keyword),
  );
}
