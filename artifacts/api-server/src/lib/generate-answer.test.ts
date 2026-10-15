import { describe, expect, it, vi } from "vitest";
import { generateAnswer } from "./generate-answer";
import type { AnswerProvider } from "./llm";

const chunk = {
  sourceId: "article",
  sourceName: "Help Center",
  articleId: "article",
  articleName: "Help Center",
  content: "Invoices are available in Settings.",
  distance: 0.1,
};

describe("generateAnswer", () => {
  it("bypasses the provider for greetings and resolutions", async () => {
    const generate = vi.fn();
    const provider = { generate } as AnswerProvider;
    const greeting = await generateAnswer("Hello", [], {}, [], provider);
    const resolved = await generateAnswer("Thanks, that works", [], {}, [], provider);

    expect(greeting.resolutionStatus).toBe("active");
    expect(resolved.resolutionStatus).toBe("resolved");
    expect(generate).not.toHaveBeenCalled();
  });

  it("passes retrieved passages to the answer provider", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Your invoice is ready.",
      answerable: true,
      model: "gpt-5-nano",
      totalTokens: 12,
      promptAssembled: "assembled",
      citations: [],
    });
    const result = await generateAnswer(
      "Where is my invoice?",
      [{ sender: "user", content: "Where is my invoice?" }],
      { email: "user@example.com" },
      [chunk],
      { generate } as AnswerProvider,
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievedChunks: [expect.objectContaining({ articleName: "Help Center" })],
      }),
    );
    expect(result.responseText).toContain("Your invoice is ready.");
    expect(result.answerable).toBe(true);
  });

  it("localizes the resolution follow-up from the answer context", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Tu factura está lista.",
      answerable: true,
      model: "gpt-5-nano",
      totalTokens: 12,
      promptAssembled: "assembled",
    });

    const result = await generateAnswer(
      "Can I download it?",
      [
        { sender: "user", content: "Where is my invoice?" },
        { sender: "user", content: "Can I download it?" },
      ],
      {},
      [chunk],
      { generate } as AnswerProvider,
      { browser_language: "es-ES" },
    );

    expect(result.shouldAskResolution).toBe(true);
    expect(result.responseText).toContain("¿Esta respuesta responde a tu pregunta?");
  });

  it("treats an unanswerable model response as insufficient", async () => {
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
      [
        { sender: "user", content: "I need account details." },
        { sender: "user", content: "Which email is on file?" },
      ],
      {},
      [chunk],
      { generate } as AnswerProvider,
    );

    expect(result.answerable).toBe(false);
    expect(result.resolutionStatus).toBe("pending_clarification");
    expect(result.shouldAskResolution).toBe(false);
    expect(result.citations).toEqual([]);
  });

  it("does not treat an answer as grounded when no passages were retrieved", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "I think the answer is yes.",
      answerable: true,
      model: "gpt-5-nano",
      totalTokens: 4,
      promptAssembled: "assembled",
    });
    const result = await generateAnswer(
      "Where is my invoice?",
      [],
      {},
      [],
      { generate } as AnswerProvider,
    );
    expect(result.answerable).toBe(false);
  });
});
