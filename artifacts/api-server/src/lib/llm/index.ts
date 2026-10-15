import { OpenAIAnswerProvider } from "./openai-answer-provider";
import {
  AnswerProviderError,
  type AnswerProvider,
} from "./answer-provider";
import { OpenAIEmbeddingProvider } from "./openai-embedding-provider";
import {
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "./embedding-provider";
import { OpenAIEscalationSummaryProvider } from "./openai-escalation-summary-provider";
import {
  EscalationSummaryProviderError,
  type EscalationSummaryProvider,
} from "./escalation-summary-provider";
export {
  OpenAIWelcomeMessageTranslator,
  type WelcomeMessageTranslator,
} from "./openai-welcome-message-translator";

export * from "./answer-provider";
export * from "./embedding-provider";
export * from "./escalation-summary-provider";

export function createAnswerProvider(): AnswerProvider {
  const provider = (process.env.ANSWER_LLM_PROVIDER ?? "openai")
    .trim()
    .toLowerCase();
  if (provider === "openai") {
    answerProvider ??= new OpenAIAnswerProvider();
    return answerProvider;
  }
  throw new AnswerProviderError(`Unsupported answer provider "${provider}".`);
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = (process.env.EMBEDDING_LLM_PROVIDER ?? "openai")
    .trim()
    .toLowerCase();
  if (provider === "openai") {
    embeddingProvider ??= new OpenAIEmbeddingProvider();
    return embeddingProvider;
  }
  throw new EmbeddingProviderError(
    `Unsupported embedding provider "${provider}".`,
  );
}

export function createEscalationSummaryProvider(): EscalationSummaryProvider {
  const provider = (process.env.ESCALATION_SUMMARY_LLM_PROVIDER ?? "openai")
    .trim()
    .toLowerCase();
  if (provider === "openai") {
    escalationSummaryProvider ??= new OpenAIEscalationSummaryProvider();
    return escalationSummaryProvider;
  }
  throw new EscalationSummaryProviderError(
    `Unsupported escalation-summary provider "${provider}".`,
  );
}

let answerProvider: AnswerProvider | undefined;
let embeddingProvider: EmbeddingProvider | undefined;
let escalationSummaryProvider: EscalationSummaryProvider | undefined;
