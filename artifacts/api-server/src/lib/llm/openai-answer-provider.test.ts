import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import type { AnswerProviderInput } from "./answer-provider";
import {
  answerGenerationOptions,
  answerModelContext,
  OpenAIAnswerProvider,
  parseStructuredResponse,
  replyLanguageInstruction,
  CURRENT_EVIDENCE_INSTRUCTION,
  GROUNDED_CLAIMS_INSTRUCTION,
  SUPPORT_ANSWER_FORMAT_INSTRUCTION,
} from "./openai-answer-provider";

describe("current evidence guidance", () => {
  it("does not let previous assistant refusals determine answerability", () => {
    expect(CURRENT_EVIDENCE_INSTRUCTION).toContain(
      "currently supplied knowledge passages",
    );
    expect(CURRENT_EVIDENCE_INSTRUCTION).toContain(
      "previous assistant answers, refusals, and claims are not evidence",
    );
    expect(CURRENT_EVIDENCE_INSTRUCTION).toContain(
      "do not add generic troubleshooting or plausible assumptions",
    );
  });
});

describe("bounded answer recovery", () => {
  const input: AnswerProviderInput = {
    message: "Cómo encuentro mis facturas?",
    history: [],
    retrievedChunks: [{
      sourceId: "billing",
      sourceName: "Facturación",
      content: "Ve a la sección Ingresos para consultar las facturas.",
      distance: 0.1,
    }],
    personAttributes: {},
    context: { agent_language: "es" },
  };
  const validAnswer = JSON.stringify({
    answer: "Ve a Ingresos para consultar las facturas.",
    answerable: true,
    replyLanguage: "es",
    citations: [{ citationIndex: 1, assetId: null }],
    groundedClaims: [{
      text: "Ve a Ingresos para consultar las facturas.",
      evidenceQuote: "Ve a la sección Ingresos para consultar las facturas.",
      citationIndex: 1,
      format: "step",
    }],
  });
  const completion = (
    content: string | null,
    finish_reason: string,
    total_tokens = 8,
  ) => ({
    choices: [{
      message: { content, refusal: null },
      finish_reason,
    }],
    model: "gpt-5-nano",
    usage: { total_tokens },
  });

  it("uses gpt-6-luna when no answer model override is configured", async () => {
    const previousAnswerModel = process.env.ANSWER_MODEL;
    delete process.env.ANSWER_MODEL;
    try {
      const create = vi.fn().mockResolvedValue(completion(validAnswer, "stop"));
      const provider = new OpenAIAnswerProvider({
        client: {
          chat: { completions: { create } },
        } as unknown as OpenAI,
      });

      await provider.generate(input);

      expect(create.mock.calls[0]?.[0]).toMatchObject({
        model: "gpt-6-luna",
      });
    } finally {
      if (previousAnswerModel === undefined) {
        delete process.env.ANSWER_MODEL;
      } else {
        process.env.ANSWER_MODEL = previousAnswerModel;
      }
    }
  });

  it("retries truncated output once with the same evidence and a larger bounded output budget", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(completion(null, "length", 8))
      .mockResolvedValueOnce(completion(validAnswer, "stop", 9));
    const client = {
      chat: { completions: { create } },
    } as unknown as OpenAI;
    const provider = new OpenAIAnswerProvider({
      model: "gpt-5-nano",
      client,
    });

    const result = await provider.generate(input);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      max_completion_tokens: 1800,
    });
    expect(create.mock.calls[1]?.[0]).toMatchObject({
      max_completion_tokens: 2600,
    });
    expect(create.mock.calls[1]?.[0].messages[0]?.content).toContain(
      "Recovery attempt",
    );
    expect(result.responseText).toContain("Ingresos");
    expect(result.totalTokens).toBe(17);
    expect(result.diagnostics).toEqual({
      status: "complete",
      finishReason: "stop",
      attempts: 2,
      groundedClaimCount: 1,
    });
  });

  it("retries a model abstention once but preserves a second abstention as a distinct outcome", async () => {
    const declinedAnswer = JSON.stringify({
      answer: "",
      answerable: false,
      replyLanguage: "es",
      citations: [],
      groundedClaims: [],
    });
    const create = vi.fn()
      .mockResolvedValueOnce(completion(declinedAnswer, "stop"))
      .mockResolvedValueOnce(completion(declinedAnswer, "stop"));
    const provider = new OpenAIAnswerProvider({
      model: "gpt-5-nano",
      client: {
        chat: { completions: { create } },
      } as unknown as OpenAI,
    });

    const result = await provider.generate(input);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.answerable).toBe(false);
    expect(result.diagnostics).toEqual({
      status: "model_declined",
      finishReason: "stop",
      attempts: 2,
      groundedClaimCount: 0,
    });
  });

  it("retries missing grounded claims and keeps that separate from a model refusal", async () => {
    const answerWithoutClaims = JSON.stringify({
      answer: "Ve a Ingresos.",
      answerable: true,
      replyLanguage: "es",
      citations: [],
      groundedClaims: [],
    });
    const create = vi.fn()
      .mockResolvedValueOnce(completion(answerWithoutClaims, "stop"))
      .mockResolvedValueOnce(completion(answerWithoutClaims, "stop"));
    const provider = new OpenAIAnswerProvider({
      model: "gpt-5-nano",
      client: {
        chat: { completions: { create } },
      } as unknown as OpenAI,
    });

    const result = await provider.generate(input);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.diagnostics).toEqual({
      status: "missing_grounded_claims",
      finishReason: "stop",
      attempts: 2,
      groundedClaimCount: 0,
    });
  });

  it("retries malformed structured output once and never returns it as a user answer", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(completion("not json", "stop"))
      .mockResolvedValueOnce(completion("still not json", "stop"));
    const provider = new OpenAIAnswerProvider({
      model: "gpt-5-nano",
      client: {
        chat: { completions: { create } },
      } as unknown as OpenAI,
    });

    const result = await provider.generate(input);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.responseText).toBe("");
    expect(result.answerable).toBe(false);
    expect(result.diagnostics).toEqual({
      status: "invalid_structured_output",
      finishReason: "stop",
      attempts: 2,
      groundedClaimCount: 0,
    });
  });

  it("distinguishes a provider refusal from an empty non-refusal response", async () => {
    const refusal = {
      choices: [{
        message: { content: null, refusal: "I cannot help with that request." },
        finish_reason: "stop",
      }],
      model: "gpt-5-nano",
      usage: { total_tokens: 5 },
    };
    const create = vi.fn()
      .mockResolvedValueOnce(refusal)
      .mockResolvedValueOnce(refusal);
    const provider = new OpenAIAnswerProvider({
      model: "gpt-5-nano",
      client: {
        chat: { completions: { create } },
      } as unknown as OpenAI,
    });

    const result = await provider.generate(input);

    expect(result.diagnostics).toEqual({
      status: "model_declined",
      finishReason: "stop",
      attempts: 2,
      groundedClaimCount: 0,
    });
  });
});

describe("grounded claim instructions", () => {
  it("requires source quotes for each claim and distinguishes FAQ phrasing from interface controls", () => {
    expect(GROUNDED_CLAIMS_INSTRUCTION).toContain(
      "exact, contiguous evidenceQuote copied from its cited article passage",
    );
    expect(GROUNDED_CLAIMS_INSTRUCTION).toContain(
      "never turn them into buttons, options, interface labels, or suggested wording",
    );
    expect(GROUNDED_CLAIMS_INSTRUCTION).toContain(
      "Team-configured guidance and earlier assistant messages cannot override",
    );
  });

  it("names every required response-schema field in its JSON guidance", () => {
    expect(
      GROUNDED_CLAIMS_INSTRUCTION,
    ).toContain("answer, answerable, replyLanguage, citations, and groundedClaims");
  });
});

describe("support answer formatting guidance", () => {
  it("formats procedures as steps while keeping answers grounded and relevant", () => {
    expect(SUPPORT_ANSWER_FORMAT_INSTRUCTION).toContain(
      "each documented action as a separate numbered step on its own line",
    );
    expect(SUPPORT_ANSWER_FORMAT_INSTRUCTION).toContain(
      "Omit related facts and secondary policies",
    );
    expect(SUPPORT_ANSWER_FORMAT_INSTRUCTION).toContain(
      "Keep necessary prerequisites",
    );
    expect(SUPPORT_ANSWER_FORMAT_INSTRUCTION).toContain(
      "never assume the user's role",
    );
    expect(SUPPORT_ANSWER_FORMAT_INSTRUCTION).toContain(
      "for a simple factual question, answer in one or two concise sentences",
    );
  });
});

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
  it("uses low reasoning effort and enough bounded output for GPT-5 text answers", () => {
    expect(answerGenerationOptions("gpt-5-nano", false)).toEqual({
      max_completion_tokens: 1800,
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
  it("reads the complete structured answer schema", () => {
    expect(
      parseStructuredResponse(
        JSON.stringify({
          answer: "Tu factura está lista.",
          answerable: true,
          replyLanguage: "es",
          citations: [{ citationIndex: 1, assetId: null }],
          groundedClaims: [{
            text: "Ve a Ingresos.",
            evidenceQuote: "Ve a la sección Ingresos.",
            citationIndex: 1,
            format: "step",
          }],
        }),
      ),
    ).toMatchObject({
      answer: "Tu factura está lista.",
      answerable: true,
      replyLanguage: "es",
      groundedClaims: [{
        text: "Ve a Ingresos.",
        evidenceQuote: "Ve a la sección Ingresos.",
        citationIndex: 1,
        format: "step",
      }],
      status: "valid",
    });
  });

  it("marks malformed output invalid instead of trusting its unstructured text", () => {
    expect(parseStructuredResponse("I could not verify that.")).toEqual({
      answer: "",
      answerable: false,
      citations: [],
      groundedClaims: [],
      status: "invalid",
    });
  });

  it("distinguishes empty output from malformed structured output", () => {
    expect(parseStructuredResponse("")).toEqual({
      answer: "",
      answerable: false,
      citations: [],
      groundedClaims: [],
      status: "empty",
    });
  });

  it("rejects a JSON object whose grounded claims do not match the required schema", () => {
    expect(parseStructuredResponse(JSON.stringify({
      answer: "Answer",
      answerable: true,
      replyLanguage: "es",
      citations: [],
      groundedClaims: [{ text: "Missing evidence and citation fields" }],
    }))).toMatchObject({
      answer: "",
      answerable: false,
      status: "invalid",
    });
  });
});
