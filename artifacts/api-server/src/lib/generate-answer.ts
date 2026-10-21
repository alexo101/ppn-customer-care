import { performance } from "node:perf_hooks";
import type {
  AnswerProviderDiagnostics,
  AnswerProvider,
  GroundedAnswerClaim,
  RetrievedChunk,
} from "./llm";
import { AnswerProviderError } from "./llm";
import type { WelcomeMessageTranslator } from "./llm/openai-welcome-message-translator";
import {
  localizedCommunicationMessage,
  resolutionFollowUp,
  resolveReplyLocale,
  type ReplyLocale,
} from "./reply-locale";
import { translateCustomerTemplate } from "./welcome-message";
import { isUnableToAnswerMessageMetadata } from "./unanswered-message";

type HistoryMessage = {
  sender: string;
  content: string;
  metadata?: unknown;
};

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
  groundedClaims: GroundedAnswerClaim[];
  providerDiagnostics?: AnswerProviderDiagnostics;
  timings: {
    provider_ms: number;
    language_alignment_ms: number;
  };
};

const GREETING_PHRASES = ["hello", "hi", "hey", "good morning", "good afternoon"];
const LOCALIZED_GREETING_PHRASES = ["hola", "ciao", "bonjour", "bonsoir"];

export function isDeterministicReply(
  message: string,
  history: HistoryMessage[] = [],
): boolean {
  const normalized = normalizeIntentText(message);
  return isResolution(normalized, history) || isGreeting(normalized);
}

export function requiresAnswerProvider(
  message: string,
  history: HistoryMessage[] = [],
): boolean {
  return !isDeterministicReply(message, history);
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
  const normalized = normalizeIntentText(message);
  const language = resolveReplyLocale(context.agent_language);
  if (isResolution(normalized, history)) {
    return localAnswer(
      localizedCommunicationMessage("resolved", language),
      "resolved",
    );
  }
  if (isGreeting(normalized)) {
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
  const providerHistory = history
    .filter((item, index) => {
      if (
        item.sender === "assistant" &&
        isUnableToAnswerMessageMetadata(item.metadata)
      ) {
        return false;
      }
      return !(
        index === history.length - 1 &&
        item.sender === "user" &&
        item.content.trim() === message.trim()
      );
    })
    .map((item) => ({
      role: item.sender === "assistant" ? "assistant" as const : "user" as const,
      content: item.content,
    }));
  const result = await provider.generate({
    message,
    history: providerHistory,
    retrievedChunks,
    liveData,
    personAttributes,
    context,
  });
  const providerMs = elapsedMs(providerStartedAt);
  const groundedClaims = result.groundedClaims ?? [];
  const answerable =
    (result.answerable !== false || groundedClaims.length > 0) &&
    (retrievedChunks.length > 0 || Boolean(liveData));
  const userMessageCount = history.filter((item) => item.sender === "user").length;
  const shouldAskResolution = answerable && userMessageCount >= 2;
  const alignmentStartedAt = performance.now();
  const shouldAlignRawAnswer = groundedClaims.length === 0 || Boolean(liveData);
  const [alignedText, alignedGroundedClaims] = await Promise.all([
    answerable && shouldAlignRawAnswer
      ? alignReplyToAgentLanguage(
        result.responseText,
        language,
        result.replyLanguage,
        translator,
      )
      : Promise.resolve(result.responseText),
    answerable && groundedClaims.length > 0 && !liveData
      ? Promise.all(
          groundedClaims.map(async (claim) => ({
            ...claim,
            text: await alignReplyToAgentLanguage(
              claim.text,
              language,
              result.replyLanguage,
              translator,
            ),
          })),
        )
      : Promise.resolve(groundedClaims),
  ]);
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
    groundedClaims: alignedGroundedClaims,
    ...(result.diagnostics ? { providerDiagnostics: result.diagnostics } : {}),
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
    groundedClaims: [],
    timings: { provider_ms: 0, language_alignment_ms: 0 },
  };
}

function normalizeIntentText(message: string): string {
  return message
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isResolution(message: string, history: HistoryMessage[]): boolean {
  if (!message || /[?¿]/.test(message)) return false;

  const unresolvedOrContrasting = [
    /\b(?:pero|aunque|sin embargo|but|however|although|mais|pourtant|tuttavia|pero)\b/,
    /\b(?:no veo|no encuentro|no aparece|no funciona|no esta resuelto|sigo sin|todavia no|aun no|not resolved|not fixed|not working|still need|still can't|still cannot|i still|pas resolu|ne fonctionne pas|non risolto|non funziona|ancora non)\b/,
    /\b(?:como puedo|como se|donde puedo|que hago|me puedes decir|podrias|puedes ayudarme|quiero saber|necesito|dime|por favor|como hago|how can i|what should i|where can i|can you|could you|tell me|i need|please|comment faire|que dois-je|come posso|cosa devo fare|puoi dirmi)\b/,
  ];
  if (unresolvedOrContrasting.some((pattern) => pattern.test(message))) {
    return false;
  }

  const standaloneAcknowledgment =
    /^(?:muchas gracias|mil gracias|gracias(?: por (?:la ayuda|tu ayuda|ayudarme|responder|la respuesta))?|thank you(?: so much| for (?:your help|helping me|the help|the answer|your assistance))?|thanks(?: again| a lot| for (?:your help|helping me|the help|your assistance))?|merci(?: beaucoup| pour (?:votre aide|m'avoir aide|l'aide))?|grazie(?: mille| per (?:l'aiuto|avermi aiutato|la risposta))?|todo (?:esta|va|bien|ok)|perfecto|genial|vale|de acuerdo|ya esta|listo|resuelto|solucionado|me sirve|me ha servido|great|perfect|got it|that works|all good|sounds good|okay|ok|that's great|resolved|solved|c'est bon|d'accord|parfait|tres bien|va bene|perfetto|risolto|thanks, that works|thank you, that works|perfecto, me sirve|perfecto, eso funciona|genial, me sirve)[!.…]*$/;
  if (standaloneAcknowledgment.test(message)) return true;

  const nextStepReported =
    /\b(?:he pedido|le he pedido|ya pedi|ya he pedido|he contactado|he escrito|ya contacte|ya he contactado|me he puesto en contacto|se lo digo|se lo dire|se lo voy a decir|se lo comento|se lo comentare|voy a hablar con mi gestor|hablo con mi gestor|lo consulto con mi gestor|i asked|i have asked|i've asked|i contacted|i have contacted|i've contacted|i reached out|i'll tell them|i will tell them|j'ai demande|j'ai contacte|je l'ai contacte|ho chiesto|ho contattato|ho scritto)\b/;
  const explicitPositiveLead =
    /^(?:todo (?:esta|va|bien|ok)|perfecto|genial|vale|de acuerdo|great|perfect|got it|that works|all good|sounds good|okay|ok|gracias|thanks|thank you|merci|grazie)(?=$|[\s,!.…])/;
  if (explicitPositiveLead.test(message) && nextStepReported.test(message)) {
    return true;
  }

  const lastAssistantMessage = [...history]
    .reverse()
    .find((item) => item.sender === "assistant" && item.content.trim());
  const assistantSuggestedNextStep =
    lastAssistantMessage &&
    /\b(?:contact|ask|account manager|gestor|manager|solicita|request|access|admin|acceso|contatta|chiedi|contactez|demandez|accès)\b/.test(
      normalizeIntentText(lastAssistantMessage.content),
    );
  return Boolean(assistantSuggestedNextStep && nextStepReported.test(message));
}

function isGreeting(message: string): boolean {
  return GREETING_PHRASES.some((keyword) => message.startsWith(keyword)) ||
    LOCALIZED_GREETING_PHRASES.some((keyword) => message.startsWith(keyword));
}

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}
