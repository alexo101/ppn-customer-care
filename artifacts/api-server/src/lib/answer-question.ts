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
import {
  areNearDuplicateSearchQueries,
  listEligiblePublishedArticles,
  retrieveRelevantChunks,
  scoreLexicalMatch,
} from "./retrieval";
import type { PersonAttributes } from "./targets";
import {
  localizedCommunicationMessage,
  resolutionFollowUp,
  resolveReplyLocale,
} from "./reply-locale";
import {
  detectLiveClientIntent,
  lookupLiveClient,
  queryLiveDataEndpoints,
  readQueryLiveDataSettings,
  type LiveClientHistoryMessage,
  type LiveLookupCaller,
} from "./query-live-data";
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
  internalDiagnostics?: Record<string, unknown>;
  assistantMetadata: Record<string, unknown>;
  stages: Array<{
    stage: number;
    name: string;
    status: string;
    details: Record<string, unknown>;
  }>;
};

export function buildKnowledgeRetrievalQuery(
  message: string,
  history: LiveClientHistoryMessage[],
): string {
  let currentMessageIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (
      history[index]?.sender === "user" &&
      history[index]?.content.trim() === message.trim()
    ) {
      currentMessageIndex = index;
      break;
    }
  }
  const priorMessages = currentMessageIndex >= 0
    ? history.slice(0, currentMessageIndex)
    : history;
  const relatedQuestion = [...priorMessages]
    .reverse()
    .find(
      (item) =>
        item.sender === "user" &&
        item.content.trim().length <= 300 &&
        scoreLexicalMatch(message, item.content).accepted &&
        areNearDuplicateSearchQueries(message, item.content),
    );

  return relatedQuestion
    ? relatedQuestion.content.trim()
    : message;
}

export async function answerFromKnowledge(input: {
  message: string;
  history: LiveClientHistoryMessage[];
  agentId: string | null;
  caller?: LiveLookupCaller;
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

  const liveIntent = detectLiveClientIntent(input.message, input.history);
  if (
    isDeterministicReply(input.message, input.history) &&
    liveIntent.kind === "none"
  ) {
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

  if (liveIntent.kind !== "none") {
    const [settingsRow] = await db
      .select()
      .from(agentSettingsTable)
      .where(eq(agentSettingsTable.agentId, input.agentId))
      .limit(1);
    const queryLiveData = readQueryLiveDataSettings(settingsRow?.configuration);
    const liveEndpoints = queryLiveDataEndpoints(queryLiveData);
    if (liveEndpoints.length > 0) {
      if (liveIntent.kind === "ask_name") {
        return buildLiveControlAnswer(
          localizedCommunicationMessage("liveClientNameRequired", agentLanguage),
          stages,
          "name_required",
          false,
          {},
          { status: "awaiting_name" },
        );
      }
      if (!input.caller) {
        return buildLiveControlAnswer(
          localizedCommunicationMessage("liveClientRequiresSignIn", agentLanguage),
          stages,
          "sign_in_required",
          false,
        );
      }

      const lookupStartedAt = performance.now();
      let lookup = await lookupLiveClient(
        { ...queryLiveData, endpointUrl: liveEndpoints[0].endpointUrl, endpoints: liveEndpoints },
        input.caller,
        liveIntent.clientName,
      );
      for (const endpoint of liveEndpoints.slice(1)) {
        if (
          lookup.status === "matched" ||
          lookup.status === "ambiguous" ||
          lookup.status === "unauthorized"
        ) {
          break;
        }
        lookup = await lookupLiveClient(
          { ...queryLiveData, endpointUrl: endpoint.endpointUrl, endpoints: liveEndpoints },
          input.caller,
          liveIntent.clientName,
        );
      }
      const lookupMs = elapsedMs(lookupStartedAt);
      if (lookup.status === "matched") {
        const generationStartedAt = performance.now();
        const liveData = {
          clientName: lookup.client.name,
          facts: lookup.client.facts,
        };
        const answer = await generateAnswer(
          input.message,
          input.history,
          input.person.attributes,
          [],
          createAnswerProvider(),
          {
            ...input.context,
            agent_language: agentLanguage,
            ...(settingsRow?.prompt ? { agentPrompt: settingsRow.prompt } : {}),
            ...(settingsRow?.targetAudience
              ? { targetAudience: settingsRow.targetAudience }
              : {}),
          },
          undefined,
          liveData,
        );
        const answerTimings = {
          duration_ms: elapsedMs(generationStartedAt),
          provider_ms: answer.timings.provider_ms,
          language_alignment_ms: answer.timings.language_alignment_ms,
        };
        if (!answer.answerable) {
          return buildLiveControlAnswer(
            localizedCommunicationMessage("liveClientUnavailable", agentLanguage),
            stages,
            "live_data_unavailable",
            false,
            { lookup_duration_ms: lookupMs, ...answerTimings },
          );
        }
        const guarded = applyGuardrails(answer.responseText, {
          retrievedChunks: [],
          personAttributes: input.person.attributes,
          hasAuthorizedLiveData: true,
          authorizedLiveData: liveData,
          groundedClaims: answer.groundedClaims,
        });
        if (guarded.blocked) {
          return buildLiveControlAnswer(
            localizedCommunicationMessage("liveClientUnavailable", agentLanguage),
            stages,
            "live_data_unavailable",
            false,
            {
              lookup_duration_ms: lookupMs,
              guardrails: guarded.actions,
              ...answerTimings,
            },
          );
        }
        stages[1].status = "completed";
        stages[1].details = {
          eligible_articles: 0,
          skipped: true,
          source: "live_client_data",
        };
        stages[2].status = "completed";
        stages[2].details = {
          chunks_retrieved: 0,
          model: "none",
          live_lookup_status: "matched",
          fields_used: Object.keys(liveData.facts),
          duration_ms: lookupMs,
        };
        stages[3].status = "completed";
        stages[3].details = {
          resolution_status: answer.resolutionStatus,
          model: answer.model,
          answerable: true,
          source: "live_client_data",
          guardrails: guarded.actions,
          ...answerTimings,
        };
        return {
          responseText: guarded.responseText,
          resolutionStatus: answer.resolutionStatus,
          shouldAskResolution: answer.shouldAskResolution,
          answerable: true,
          articlesUsed: [],
          articleIds: [],
          retrievedChunks: [],
          model: answer.model,
          totalTokens: answer.totalTokens,
          promptAssembled: answer.promptAssembled,
          assistantMetadata: {
            citations: [],
            liveDataLookup: {
              status: "matched",
              clientName: lookup.client.name,
            },
          },
          stages,
        };
      }

      if (lookup.status === "ambiguous") {
        return buildLiveControlAnswer(
          localizedCommunicationMessage("liveClientAmbiguous", agentLanguage),
          stages,
          "ambiguous",
          true,
          { lookup_duration_ms: lookupMs, candidate_count: lookup.candidates.length },
          { status: "ambiguous" },
        );
      }
      if (lookup.status === "not_found") {
        return buildLiveControlAnswer(
          localizedCommunicationMessage("liveClientNoMatch", agentLanguage),
          stages,
          "not_found",
          true,
          { lookup_duration_ms: lookupMs },
          { status: "not_found" },
        );
      }
      return buildLiveControlAnswer(
        localizedCommunicationMessage("liveClientUnavailable", agentLanguage),
        stages,
        lookup.status,
        false,
        { lookup_duration_ms: lookupMs },
      );
    }
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
  const retrievalQuery = buildKnowledgeRetrievalQuery(input.message, input.history);
  const [retrieval, agentSettingsRows] = eligible.length
    ? await Promise.all([
        retrieveRelevantChunks(
          eligible.map((article) => article.id),
          retrievalQuery,
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
      internalDiagnostics: {
        outcome: "no_retrieved_passages",
        retrievedChunkCount: 0,
      },
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

  const exactFaqAnswer = findExactFaqAnswer(
    input.message,
    retrievedChunks,
    agentLanguage,
  );
  if (exactFaqAnswer) {
    const userMessageCount = input.history.filter(
      (message) => message.sender === "user",
    ).length;
    const shouldAskResolution = userMessageCount >= 2;
    const citation = {
      sourceId: exactFaqAnswer.chunk.sourceId,
      sourceName: exactFaqAnswer.chunk.sourceName,
      articleId: exactFaqAnswer.chunk.articleId ?? exactFaqAnswer.chunk.sourceId,
      articleName:
        exactFaqAnswer.chunk.articleName ?? exactFaqAnswer.chunk.sourceName,
      ...(exactFaqAnswer.chunk.chunkId
        ? { chunkId: exactFaqAnswer.chunk.chunkId }
        : {}),
      excerpt: exactFaqAnswer.answer,
    };
    stages[3].status = "completed";
    stages[3].details = {
      resolution_status: shouldAskResolution ? "pending_resolution" : "active",
      model: "deterministic-exact-faq",
      answerable: true,
      chunks_used: 1,
      source: "exact_faq_match",
    };
    return {
      responseText: shouldAskResolution
        ? `${exactFaqAnswer.answer}\n\n${resolutionFollowUp(agentLanguage)}`
        : exactFaqAnswer.answer,
      resolutionStatus: shouldAskResolution ? "pending_resolution" : "active",
      shouldAskResolution,
      answerable: true,
      articlesUsed: [exactFaqAnswer.chunk.articleName ?? exactFaqAnswer.chunk.sourceName],
      articleIds: [exactFaqAnswer.chunk.articleId ?? exactFaqAnswer.chunk.sourceId],
      retrievedChunks,
      model: [retrievalModel, "deterministic-exact-faq"]
        .filter((model) => model !== "none")
        .join(", "),
      totalTokens: retrievalTokens,
      promptAssembled: "",
      internalDiagnostics: {
        outcome: "answered_from_exact_faq",
        retrievedChunkCount: retrievedChunks.length,
      },
      assistantMetadata: { citations: [citation] },
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
    requiresAnswerProvider(input.message, input.history)
      ? createAnswerProvider()
      : undefined,
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

  const guardrailResult = applyGuardrails(answer.responseText, {
    retrievedChunks,
    personAttributes: input.person.attributes,
    groundedClaims: answer.groundedClaims,
  });
  if (!answer.answerable || guardrailResult.blocked) {
    const providerStatus = answer.providerDiagnostics?.status;
    const outcome =
      providerStatus && providerStatus !== "complete"
        ? providerStatus
        : !answer.answerable
          ? "model_declined"
          : guardrailResult.diagnostics.claimsReceived === 0
          ? "grounded_claims_missing"
          : "all_grounded_claims_rejected";
    const diagnostics = {
      outcome,
      provider: answer.providerDiagnostics ?? { status: "not_reported" },
      evidence: guardrailResult.diagnostics,
    };
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
      guardrails: guardrailResult.actions,
      ...answerTimings,
    };
    return {
      ...insufficient,
      internalDiagnostics: diagnostics,
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
    responseText: answer.shouldAskResolution
      ? `${guardrailResult.responseText}\n\n${resolutionFollowUp(agentLanguage)}`
      : guardrailResult.responseText,
    resolutionStatus: answer.resolutionStatus,
    shouldAskResolution: answer.shouldAskResolution,
    answerable: true,
    articlesUsed,
    articleIds,
    retrievedChunks,
    model: [retrievalModel, answer.model].filter((model) => model !== "none").join(", "),
    totalTokens: retrievalTokens + answer.totalTokens,
    promptAssembled: answer.promptAssembled,
    internalDiagnostics: {
      outcome: "answered",
      provider: answer.providerDiagnostics ?? { status: "not_reported" },
      evidence: guardrailResult.diagnostics,
    },
    assistantMetadata: { citations: answer.citations },
    stages,
  };
}

function buildLiveControlAnswer(
  responseText: string,
  stages: AnswerWorkflowResult["stages"],
  lookupStatus: string,
  answerable: boolean,
  details: Record<string, unknown> = {},
  liveDataLookup?: Record<string, unknown>,
): AnswerWorkflowResult {
  stages[1].status = "completed";
  stages[1].details = {
    eligible_articles: 0,
    skipped: true,
    source: "live_client_data",
  };
  stages[2].status = "completed";
  stages[2].details = {
    chunks_retrieved: 0,
    model: "none",
    live_lookup_status: lookupStatus,
    ...details,
  };
  stages[3].status = "completed";
  stages[3].details = {
    resolution_status: answerable ? "active" : "pending_clarification",
    model: "none",
    answerable,
    source: "live_client_data",
  };
  return {
    responseText,
    resolutionStatus: answerable ? "active" : "pending_clarification",
    shouldAskResolution: false,
    answerable,
    articlesUsed: [],
    articleIds: [],
    retrievedChunks: [],
    model: "none",
    totalTokens: 0,
    promptAssembled: "",
    assistantMetadata: {
      citations: [],
      ...(liveDataLookup ? { liveDataLookup } : {}),
    },
    stages,
  };
}

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function findExactFaqAnswer(
  message: string,
  chunks: RetrievedChunk[],
  agentLanguage: ReturnType<typeof resolveReplyLocale>,
): { answer: string; chunk: RetrievedChunk } | undefined {
  if (agentLanguage !== "en" && agentLanguage !== "es") return undefined;
  const normalizedMessage = normalizeFaqText(message);
  if (!normalizedMessage) return undefined;

  for (const chunk of chunks) {
    const firstSentenceEnd = chunk.content.search(/[.!?](?:\s|$)/);
    if (firstSentenceEnd < 0) continue;
    const questionGroup = chunk.content.slice(0, firstSentenceEnd);
    const matchingQuestion = questionGroup
      .split("/")
      .map((part) => part.trim())
      .find((part) => normalizeFaqText(part) === normalizedMessage);
    if (!matchingQuestion || detectFaqLanguage(matchingQuestion) !== agentLanguage) {
      continue;
    }

    const answerStart = firstSentenceEnd + 1;
    const answerText = chunk.content.slice(answerStart).trim();
    const answerEnd = answerText.search(/[.!?](?:\s|$)/);
    const answer = (
      answerEnd >= 0 ? answerText.slice(0, answerEnd + 1) : answerText
    ).trim();
    if (
      answer.length < 12 ||
      detectFaqLanguage(answer) !== agentLanguage
    ) {
      continue;
    }
    return { answer, chunk };
  }
  return undefined;
}

function normalizeFaqText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function detectFaqLanguage(value: string): "en" | "es" | undefined {
  const tokens = new Set(normalizeFaqText(value).split(" "));
  const english = [
    "the", "are", "is", "in", "on", "from", "for", "you", "your", "with",
    "and", "or", "of", "can", "to", "find", "go", "call",
  ].filter((word) => tokens.has(word)).length;
  const spanish = [
    "el", "la", "las", "los", "una", "uno", "en", "de", "del", "que", "para",
    "puedes", "puede", "esta", "estan", "con", "por", "y", "quiero", "llamen",
    "contacten", "hablar", "encuentra",
  ].filter((word) => tokens.has(word)).length;
  if (english >= 2 && english > spanish) return "en";
  if (spanish >= 2 && spanish > english) return "es";
  return undefined;
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
