import { describe, expect, it } from "vitest";
import {
  answerGenerationOptions,
  answerModelContext,
  parseStructuredResponse,
  replyLanguageInstruction,
} from "./openai-answer-provider";

describe("replyLanguageInstruction", () => {
  it("pins the response and reported language to the configured agent language", () => {
    expect(replyLanguageInstruction("es")).toContain("Respond entirely in this language");
    expect(replyLanguageInstruction("es")).toContain('Set replyLanguage to "es"');
    expect(replyLanguageInstruction("es")).toContain("regardless of the user's message language");
    expect(replyLanguageInstruction("es")).toContain("team-configured guidance");
    expect(replyLanguageInstruction("es")).toContain("browser language");
    expect(replyLanguageInstruction("es")).toContain("supplied knowledge");
    expect(replyLanguageInstruction("fr")).toContain("setting: fr");
  });

  it("keeps browser language out of the model context", () => {
    expect(
      answerModelContext({
        agent_language: "es",
        browser_language: "en-US",
        currentUrl: "https://app.example.com",
      }),
    ).toEqual({
      agent_language: "es",
      currentUrl: "https://app.example.com",
    });
  });
});

describe("answerGenerationOptions", () => {
  it("uses low reasoning effort for GPT-5 text answers with a bounded response", () => {
    expect(answerGenerationOptions("gpt-5-nano", false)).toEqual({
      max_completion_tokens: 700,
      reasoning_effort: "low",
    });
  });

  it("does not send GPT-5 reasoning settings to vision or non-reasoning models", () => {
    expect(answerGenerationOptions("gpt-4o-mini", true)).toEqual({
      max_completion_tokens: 700,
    });
    expect(answerGenerationOptions("gpt-4o-mini", false)).toEqual({
      max_completion_tokens: 700,
    });
  });
});

describe("parseStructuredResponse", () => {
  it("reads structured answerability and language", () => {
    expect(
      parseStructuredResponse(
        JSON.stringify({
          answer: "Tu factura está lista.",
          answerable: true,
          replyLanguage: "es",
          citations: [{ citationIndex: 1, assetId: null }],
        }),
      ),
    ).toMatchObject({
      answer: "Tu factura está lista.",
      answerable: true,
      replyLanguage: "es",
    });
  });

  it("safely treats malformed provider output as a normal answer", () => {
    expect(parseStructuredResponse("I could not verify that.")).toEqual({
      answer: "I could not verify that.",
      answerable: true,
      citations: [],
    });
  });
});
