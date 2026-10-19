import { performance } from "node:perf_hooks";
import { agentSettingsTable } from "@workspace/db";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateAnswer, isDeterministicReply, requiresAnswerProvider } from "./generate-answer";
import { applyGuardrails } from "./guardrails";
import {
  AnswerProviderError,
  EmbeddingProviderError,
  createAnswerProvider,
  createEmbeddingProvider,
  type RetrievedChunk,
} from "./llm";
import { listEligiblePublishedArticles, retrieveRelevantChunks } from "./retrieval";
import type { PersonAttributes } from "./targets";
import { localizedCommunicationMessage, resolveReplyLocale } from "./reply-locale";
import {
  buildUnableToAnswerResponse,
  translateEscalationTemplate,
} from "./unanswered-message";

export type AnswerWorkflowResult = {
  responseText: string;
  resolutionStatus: string;
  shouldAskResolution: boolean;
  answerable: boolean;
  articlesUsed: string[];
  articleIds: string[];
  retrievedChunks: RetrievedChunk[];
  model: string;
  totalTokens: number;
  promptAssembled: string;
  assistantMetadata: Record<string, unknown>;
  stages: Array<{
    stage: number;
    name: string;
    status: string;
    details: Record<string, unknown>;
  }>;
};

export async function answerFromKnowledge(input: {
  message: string;
  history: Array<{ sender: string; content: string }>;
  agentId: string | null;
  person: PersonAttributes;
  context: Record<string, unknown>;
  replyLocaleCandidates: unknown[];
  userName: string;
  escalationTemplate: string;
}): Promise<AnswerWorkflowResult> {
  const agentLanguage = resolveReplyLocale(input.context.agent_language);
  const stages = buildStages();
  stages[0].status = "completed";
  stages[0].details = {
    person_type: input.person.personType,
    context_fields: Object.keys(input.context).filter((key) => input.context[key] != null),
  };

  if (isDeterministicReply(input.message)) {
    stages[1].status = "completed";
    stages[1].details = { eligible_articles: 0, skipped: true };
    stages[2].status = "completed";
    stages[2].details = { chunks_retrieved: 0, model: "none" };
    const answer = await generateAnswer(
      input.message,
      input.history,
      input.person.attributes,
      [],
      undefined,
      input.context,
    );
    stages[3].status = "completed";
    stages[3].details = { resolution_status: answer.resolutionStatus, model: answer.model, answerable: true };
    return {
      responseText: answer.responseText,
      resolutionStatus: answer.resolutionStatus,
      shouldAskResolution: answer.shouldAskResolution,
      answerable: true,
      articlesUsed: [],
      articleIds: [],
      retrievedChunks: [],
      model: answer.model,
      totalTokens: answer.totalTokens,
      promptAssembled: answer.promptAssembled,
      assistantMetadata: { citations: [] },
      stages,
    };
  }

  if (!input.agentId) {
    stages[1].status = "completed";
    stages[1].details = { eligible_articles: 0 };
    stages[2].status = "completed";
    stages[2].details = { chunks_retrieved: 0, model: "none" };
    const insufficient = await insufficientAnswer(
      input.escalationTemplate,
      input.userName,
      [agentLanguage],
    );
    stages[3].status = "completed";
    stages[3].details = { answerable: false, model: "deterministic-unable-to-answer" };
    return {
      ...insufficient,
      answerable: false,
      articlesUsed: [],
      articleIds: [],
      retrievedChunks: [],
      model: "deterministic-unable-to-answer",
      totalTokens: 0,
      promptAssembled: "",
      stages,
    };
  }

  stages[1].status = "running";
  const eligibilityStartedAt = performance.now();
  const eligible = await listEligiblePublishedArticles(input.agentId, input.person);
  const eligibilityMs = elapsedMs(eligibilityStartedAt);
  stages[1].status = "completed";
  stages[1].details = {
    eligible_articles: eligible.length,
    articles: eligible.map((article) => article.title),
    duration_ms: eligibilityMs,
  };

  stages[2].status = "running";
  const retrievalStartedAt = performance.now();
  const [retrieval, agentSettingsRows] = eligible.length
    ? await Promise.all([
        retrieveRelevantChunks(
          eligible.map((article) => article.id),
          input.message,
          createEmbeddingProvider(),
          5,
          { agentId: input.agentId },
        ),
        db
          .select()
          .from(agentSettingsTable)
          .where(eq(agentSettingsTable.agentId, input.agentId))
          .limit(1),
      ])
    : [
        {
          chunks: [] as RetrievedChunk[],
          totalTokens: 0,
          model: "none",
          diagnostics: {
            vectorCandidates: 0,
            lexicalCandidates: 0,
            lexicalAccepted: 0,
          },
        },
        [],
      ];
  const retrievalMs = elapsedMs(retrievalStartedAt);
  const retrievedChunks = retrieval.chunks;
  const retrievalModel = retrieval.model;
  const retrievalTokens = retrieval.totalTokens;
  const articlesUsed = [...new Set(retrievedChunks.map((chunk) => chunk.articleName ?? chunk.sourceName))];
  const articleIds = [...new Set(retrievedChunks.map((chunk) => chunk.articleId ?? chunk.sourceId))];
  stages[2].status = "completed";
  stages[2].details = {
    chunks_retrieved: retrievedChunks.length,
    articles: articlesUsed,
    model: retrievalModel,
    duration_ms: retrievalMs,
    ...("diagnostics" in retrieval ? retrieval.diagnostics : {}),
  };

  stages[3].status = "running";
  if (retrievedChunks.length === 0) {
    const insufficient = await insufficientAnswer(
      input.escalationTemplate,
      input.userName,
      [agentLanguage],
    );
    stages[3].status = "completed";
    stages[3].details = {
      resolution_status: insufficient.resolutionStatus,
      model: "deterministic-unable-to-answer",
      answerable: false,
    };
    return {
      ...insufficient,
      answerable: false,
      articlesUsed,
      articleIds,
      retrievedChunks,
      model: "deterministic-unable-to-answer",
      totalTokens: retrievalTokens,
      promptAssembled: "",
      stages,
    };
  }

  const [agentSettings] = agentSettingsRows;
  const generationStartedAt = performance.now();
  const answer = await generateAnswer(
    input.message,
    input.history,
    input.person.attributes,
    retrievedChunks,
    requiresAnswerProvider(input.message) ? createAnswerProvider() : undefined,
    {
      ...input.context,
      agent_language: agentLanguage,
      ...(agentSettings?.prompt ? { agentPrompt: agentSettings.prompt } : {}),
      ...(agentSettings?.targetAudience ? { targetAudience: agentSettings.targetAudience } : {}),
    },
  );
  const generationMs = elapsedMs(generationStartedAt);
  const answerTimings = {
    duration_ms: generationMs,
    provider_ms: answer.timings.provider_ms,
    language_alignment_ms: answer.timings.language_alignment_ms,
  };

  if (!answer.answerable) {
    const insufficient = await insufficientAnswer(
      input.escalationTemplate,
      input.userName,
      [agentLanguage],
    );
    stages[3].status = "completed";
    stages[3].details = {
      resolution_status: insufficient.resolutionStatus,
      model: answer.model,
      answerable: false,
      chunks_used: retrievedChunks.length,
      ...answerTimings,
    };
    return {
      ...insufficient,
      answerable: false,
      articlesUsed,
      articleIds,
      retrievedChunks,
      model: answer.model,
      totalTokens: retrievalTokens + answer.totalTokens,
      promptAssembled: answer.promptAssembled,
      stages,
    };
  }

  const guardrailResult = applyGuardrails(answer.responseText, {
    retrievedChunks,
    personAttributes: input.person.attributes,
  });
  if (guardrailResult.blocked) {
    const insufficient = await insufficientAnswer(
      input.escalationTemplate,
      input.userName,
      [agentLanguage],
    );
    stages[3].status = "completed";
    stages[3].details = {
      resolution_status: insufficient.resolutionStatus,
      model: answer.model,
      answerable: false,
      guardrails: guardrailResult.actions,
      ...answerTimings,
    };
    return {
      ...insufficient,
      answerable: false,
      articlesUsed,
      articleIds,
      retrievedChunks,
      model: answer.model,
      totalTokens: retrievalTokens + answer.totalTokens,
      promptAssembled: answer.promptAssembled,
      stages,
    };
  }

  stages[3].status = "completed";
  stages[3].details = {
    resolution_status: answer.resolutionStatus,
    model: answer.model,
    answerable: true,
    chunks_used: retrievedChunks.length,
    guardrails: guardrailResult.actions,
    ...answerTimings,
  };
  return {
    responseText: guardrailResult.responseText,
    resolutionStatus: answer.resolutionStatus,
    shouldAskResolution: answer.shouldAskResolution,
    answerable: true,
    articlesUsed,
    articleIds,
    retrievedChunks,
    model: [retrievalModel, answer.model].filter((model) => model !== "none").join(", "),
    totalTokens: retrievalTokens + answer.totalTokens,
    promptAssembled: answer.promptAssembled,
    assistantMetadata: { citations: answer.citations },
    stages,
  };
}

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

export function workflowProviderErrorMessage(error: unknown): string | null {
  if (error instanceof EmbeddingProviderError || error instanceof AnswerProviderError) {
    return error.message;
  }
  return null;
}

async function insufficientAnswer(
  template: string,
  userName: string,
  replyLocaleCandidates: unknown[],
) {
  const [insufficientTemplate, offerTemplate] = await Promise.all([
    Promise.resolve(
      localizedCommunicationMessage("unableToAnswer", ...replyLocaleCandidates),
    ),
    translateEscalationTemplate(template, replyLocaleCandidates),
  ]);
  const insufficient = buildUnableToAnswerResponse(insufficientTemplate, userName);
  const offer = buildUnableToAnswerResponse(offerTemplate, userName);
  return {
    responseText: `${insufficient.responseText}\n\n${offer.responseText}`.trim(),
    resolutionStatus: insufficient.resolutionStatus,
    shouldAskResolution: false,
    assistantMetadata: insufficient.metadata,
  };
}

function buildStages() {
  return [
    { stage: 1, name: "Capture User Identity", status: "pending", details: {} as Record<string, unknown> },
    { stage: 2, name: "Select Eligible Articles", status: "pending", details: {} as Record<string, unknown> },
    { stage: 3, name: "Retrieve Knowledge", status: "pending", details: {} as Record<string, unknown> },
    { stage: 4, name: "Generate Response", status: "pending", details: {} as Record<string, unknown> },
  ];
}
