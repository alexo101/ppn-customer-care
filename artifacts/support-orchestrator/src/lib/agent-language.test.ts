import { describe, expect, it } from "vitest";
import {
  AGENT_LANGUAGE_OPTIONS,
  agentLanguageCopy,
  normalizeAgentLanguage,
} from "./agent-language";

describe("agent language options and chat copy", () => {
  it("offers the four supported languages without browser auto-detection", () => {
    expect(AGENT_LANGUAGE_OPTIONS.map(({ value }) => value)).toEqual([
      "en",
      "es",
      "fr",
      "it",
    ]);
  });

  it("uses English only for unset or unsupported settings", () => {
    expect(normalizeAgentLanguage(undefined)).toBe("en");
    expect(normalizeAgentLanguage("de")).toBe("en");
    expect(normalizeAgentLanguage("es")).toBe("es");
  });

  it("renders customer-facing preview copy in the saved agent language", () => {
    expect(agentLanguageCopy("es", "messagePlaceholder")).toBe(
      "Escribe tu mensaje...",
    );
    expect(agentLanguageCopy("fr", "previewWelcome")).toContain("Bonjour");
    expect(agentLanguageCopy("it", "npsQuestion")).toContain("Come valuti");
    expect(agentLanguageCopy("es", "selectQuestion")).toContain("Selecciona una pregunta");
    expect(agentLanguageCopy("fr", "runAgain")).toBe("Relancer");
  });
});
