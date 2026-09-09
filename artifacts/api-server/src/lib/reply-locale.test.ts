import { describe, expect, it } from "vitest";
import {
  fallbackClarificationPrompt,
  resolveReplyLocale,
  resolutionFollowUp,
} from "./reply-locale";

describe("resolveReplyLocale", () => {
  it("maps Spanish, Italian, and French locales including regional tags", () => {
    expect(resolveReplyLocale("es-ES")).toBe("es");
    expect(resolveReplyLocale("ES_mx")).toBe("es");
    expect(resolveReplyLocale("it-IT")).toBe("it");
    expect(resolveReplyLocale("fr-FR")).toBe("fr");
  });

  it("falls back to English for missing or unsupported locales", () => {
    expect(resolveReplyLocale(undefined)).toBe("en");
    expect(resolveReplyLocale("en-US")).toBe("en");
    expect(resolveReplyLocale("de-DE")).toBe("en");
    expect(resolveReplyLocale("not a locale")).toBe("en");
  });

  it("prefers the first valid candidate", () => {
    expect(resolveReplyLocale(undefined, "fr")).toBe("fr");
    expect(resolveReplyLocale("es", "it")).toBe("es");
  });
});

describe("fallbackClarificationPrompt", () => {
  it("returns English copy by default", () => {
    expect(fallbackClarificationPrompt("noMatchingRule")).toBe(
      "I couldn't identify a configured support workflow for that request. Could you provide more detail?",
    );
    expect(fallbackClarificationPrompt("accessDenied")).toBe(
      "I don't have permission to access the information needed for this request. Please contact an administrator or human support agent.",
    );
  });

  it("returns Spanish, Italian, and French copy", () => {
    expect(fallbackClarificationPrompt("noMatchingRule", "es")).toContain(
      "flujo de soporte",
    );
    expect(fallbackClarificationPrompt("accessDenied", "es")).toContain(
      "No tengo permiso",
    );
    expect(fallbackClarificationPrompt("noMatchingRule", "it")).toContain(
      "flusso di supporto",
    );
    expect(fallbackClarificationPrompt("accessDenied", "it")).toContain(
      "Non ho il permesso",
    );
    expect(fallbackClarificationPrompt("noMatchingRule", "fr")).toContain(
      "flux d’assistance",
    );
    expect(fallbackClarificationPrompt("accessDenied", "fr")).toContain(
      "Je n’ai pas l’autorisation",
    );
  });
});

describe("resolutionFollowUp", () => {
  it("localizes the deterministic follow-up for supported locales", () => {
    expect(resolutionFollowUp("es-ES")).toContain("responde a tu pregunta");
    expect(resolutionFollowUp("it-IT")).toContain("risponde alla tua domanda");
    expect(resolutionFollowUp("fr-FR")).toContain("répond-elle à votre question");
  });

  it("falls back to English for unsupported locales", () => {
    expect(resolutionFollowUp("de-DE")).toBe(
      "Does this answer your question? Please let me know if you need further assistance.",
    );
  });
});
