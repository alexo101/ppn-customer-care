import { OpenAIRuleAuthoringProvider } from "./openai-rule-authoring-provider";
import {
  RuleAuthoringProviderError,
  type RuleAuthoringProvider,
} from "./rule-authoring-provider";
import { OpenAIClassificationProvider } from "./openai-classification-provider";
import {
  ClassificationProviderError,
  type ClassificationProvider,
} from "./classification-provider";
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
export {
  OpenAIWelcomeMessageTranslator,
  type WelcomeMessageTranslator,
} from "./openai-welcome-message-translator";

export * from "./rule-authoring-provider";
export * from "./classification-provider";
export * from "./answer-provider";
export * from "./embedding-provider";

export function createRuleAuthoringProvider(): RuleAuthoringProvider {
  const provider = (process.env.RULE_AUTHORING_LLM_PROVIDER ?? "openai")
    .trim()
    .toLowerCase();

  if (provider === "openai") {
    return getOpenAIProvider();
  }

  throw new RuleAuthoringProviderError(
    `Unsupported rule-authoring provider "${provider}".`,
  );
}

export function createClassificationProvider(): ClassificationProvider {
  const provider = (process.env.CLASSIFICATION_LLM_PROVIDER ?? "openai")
    .trim()
    .toLowerCase();
  if (provider === "openai") {
    classificationProvider ??= new OpenAIClassificationProvider();
    return classificationProvider;
  }
  throw new ClassificationProviderError(
    `Unsupported classification provider "${provider}".`,
  );
}

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

let openAIProvider: RuleAuthoringProvider | undefined;
let classificationProvider: ClassificationProvider | undefined;
let answerProvider: AnswerProvider | undefined;
let embeddingProvider: EmbeddingProvider | undefined;

function getOpenAIProvider(): RuleAuthoringProvider {
  openAIProvider ??= new OpenAIRuleAuthoringProvider();
  return openAIProvider;
}
