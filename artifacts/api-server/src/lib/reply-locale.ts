import { normalizeBrowserLanguage } from "./welcome-message";

export type ReplyLocale = "en" | "es" | "it" | "fr";

const FALLBACK_MESSAGES = {
  noMatchingRule: {
    en: "I couldn't identify a configured support workflow for that request. Could you provide more detail?",
    es: "No pude identificar un flujo de soporte configurado para esa solicitud. ¿Podrías darme más detalles?",
    it: "Non sono riuscito a identificare un flusso di supporto configurato per questa richiesta. Potresti fornire più dettagli?",
    fr: "Je n’ai pas pu identifier un flux d’assistance configuré pour cette demande. Pourriez-vous donner plus de détails ?",
  },
  accessDenied: {
    en: "I don't have permission to access the information needed for this request. Please contact an administrator or human support agent.",
    es: "No tengo permiso para acceder a la información necesaria para esta solicitud. Ponte en contacto con un administrador o un agente de soporte humano.",
    it: "Non ho il permesso di accedere alle informazioni necessarie per questa richiesta. Contatta un amministratore o un agente di supporto umano.",
    fr: "Je n’ai pas l’autorisation d’accéder aux informations nécessaires pour cette demande. Veuillez contacter un administrateur ou un agent de support humain.",
  },
} as const;

export function resolveReplyLocale(
  ...candidates: unknown[]
): ReplyLocale {
  for (const candidate of candidates) {
    const normalized = normalizeBrowserLanguage(candidate);
    if (!normalized) continue;
    const language = normalized.split("-")[0];
    if (language === "es" || language === "it" || language === "fr") {
      return language;
    }
    if (language === "en") return "en";
  }
  return "en";
}

export function fallbackClarificationPrompt(
  kind: keyof typeof FALLBACK_MESSAGES,
  ...localeCandidates: unknown[]
): string {
  const locale = resolveReplyLocale(...localeCandidates);
  return FALLBACK_MESSAGES[kind][locale];
}
