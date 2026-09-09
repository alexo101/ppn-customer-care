import { describe, expect, it, vi } from "vitest";
import type { ClassificationResult } from "@workspace/api-zod";
import { generateAnswer } from "./generate-answer";
import type { AnswerProvider } from "./llm";

const classification: ClassificationResult = {
  primaryCategory: "Billing",
  primaryCategoryId: "billing",
  confidence: 0.9,
  secondaryCategories: [],
  entities: {},
  rule: "None",
  ruleId: "",
};

const rule = {
  action: "search answer",
  description: "Answer billing questions",
  promptTemplate: "Use a concise answer.",
  requiresClarificationPrompt: "",
  escalationTrigger: false,
};

describe("generateAnswer", () => {
  it("bypasses the provider for escalation", async () => {
    const generate = vi.fn();
    const result = await generateAnswer(
      "Please escalate this",
      classification,
      { ...rule, action: "escalate", escalationTrigger: true },
      [],
      {},
      [],
      { generate } as AnswerProvider,
    );

    expect(result.resolutionStatus).toBe("escalated");
    expect(generate).not.toHaveBeenCalled();
  });

  it("bypasses the provider for clarification, greetings, and resolutions", async () => {
    const generate = vi.fn();
    const provider = { generate } as AnswerProvider;
    const cases = [
      {
        message: "I need more details",
        rule: {
          ...rule,
          action: "ask clarification",
          requiresClarificationPrompt: "Which invoice?",
        },
        status: "pending_clarification",
      },
      { message: "Hello", rule: null, status: "active" },
      { message: "Thanks, that works", rule: null, status: "resolved" },
    ];

    for (const testCase of cases) {
      const result = await generateAnswer(
        testCase.message,
        classification,
        testCase.rule,
        [],
        {},
        [],
        provider,
      );
      expect(result.resolutionStatus).toBe(testCase.status);
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it("passes retrieved chunks to the answer provider", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Your invoice is ready.",
      model: "gpt-5-nano",
      totalTokens: 12,
      promptAssembled: "assembled",
    });
    const result = await generateAnswer(
      "Where is my invoice?",
      classification,
      rule,
      [{ sender: "user", content: "Where is my invoice?" }],
      { email: "user@example.com" },
      [
        {
          sourceId: "source",
          sourceName: "Help Center",
          content: "Invoices are available in Settings.",
          distance: 0.1,
        },
      ],
      { generate } as AnswerProvider,
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievedChunks: [
          expect.objectContaining({ sourceName: "Help Center" }),
        ],
      }),
    );
    expect(result.responseText).toContain("Your invoice is ready.");
  });

  it("localizes the resolution follow-up from the answer context", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Tu factura está lista.",
      model: "gpt-5-nano",
      totalTokens: 12,
      promptAssembled: "assembled",
    });

    const result = await generateAnswer(
      "Can I download it?",
      classification,
      rule,
      [
        { sender: "user", content: "Where is my invoice?" },
        { sender: "user", content: "Can I download it?" },
      ],
      {},
      [],
      { generate } as AnswerProvider,
      { browser_language: "es-ES" },
    );

    expect(result.shouldAskResolution).toBe(true);
    expect(result.responseText).toContain(
      "¿Esta respuesta responde a tu pregunta?",
    );
    expect(result.responseText).not.toContain(
      "Does this answer your question?",
    );
  });

  it("prefers the provider language over the browser language", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Tu factura está lista.",
      answerable: true,
      replyLanguage: "es",
      model: "gpt-5-nano",
      totalTokens: 12,
      promptAssembled: "assembled",
    });

    const result = await generateAnswer(
      "Can I download it?",
      classification,
      rule,
      [
        { sender: "user", content: "Where is my invoice?" },
        { sender: "user", content: "Can I download it?" },
      ],
      {},
      [],
      { generate } as AnswerProvider,
      { browser_language: "en-US" },
    );

    expect(result.responseText).toContain(
      "¿Esta respuesta responde a tu pregunta?",
    );
    expect(result.responseText).not.toContain(
      "Does this answer your question?",
    );
  });

  it("suppresses resolution follow-up text for insufficient answers", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "No encontré esa información.",
      answerable: false,
      replyLanguage: "es",
      model: "gpt-5-nano",
      totalTokens: 12,
      promptAssembled: "assembled",
    });

    const result = await generateAnswer(
      "Which email is on file?",
      classification,
      rule,
      [
        { sender: "user", content: "I need account details." },
        { sender: "user", content: "Which email is on file?" },
      ],
      {},
      [
        {
          sourceId: "source",
          sourceName: "Help Center",
          content: "Account settings are available here.",
          distance: 0.1,
        },
      ],
      { generate } as AnswerProvider,
      { browser_language: "en-US" },
    );

    expect(result.answerable).toBe(false);
    expect(result.resolutionStatus).toBe("pending_clarification");
    expect(result.shouldAskResolution).toBe(false);
    expect(result.responseText).toBe("No encontré esa información.");
    expect(result.responseText).not.toContain(
      "Does this answer your question?",
    );
  });

  it("propagates answer provider failures", async () => {
    const error = new Error("provider failed");
    const provider: AnswerProvider = {
      generate: vi.fn().mockRejectedValue(error),
    };

    await expect(
      generateAnswer(
        "Where is my invoice?",
        classification,
        rule,
        [],
        {},
        [],
        provider,
      ),
    ).rejects.toBe(error);
  });
});
