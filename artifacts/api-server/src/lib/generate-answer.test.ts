import { describe, expect, it, vi } from "vitest";
import { alignReplyToAgentLanguage, generateAnswer } from "./generate-answer";
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

  it("recognizes a Spanish confirmation of the recommended next step without retrieval", async () => {
    const generate = vi.fn();
    const result = await generateAnswer(
      "todo ok le he pedido a mi gestor que me ponga de admin",
      [
        { sender: "user", content: "No veo la sección Ingresos." },
        {
          sender: "assistant",
          content: "Contacta con tu account manager para que te dé acceso.",
        },
        {
          sender: "user",
          content: "todo ok le he pedido a mi gestor que me ponga de admin",
        },
      ],
      {},
      [],
      { generate } as AnswerProvider,
      { agent_language: "es" },
    );

    expect(generate).not.toHaveBeenCalled();
    expect(result.resolutionStatus).toBe("resolved");
    expect(result.shouldAskResolution).toBe(false);
    expect(result.responseText).toBe(
      "Me alegra haber podido ayudarte. Si necesitas algo más, aquí estoy.",
    );
    expect(result.responseText).not.toMatch(/valorar|rate/i);
  });

  it("uses recent assistant guidance to recognize a reported next step", async () => {
    const result = await generateAnswer(
      "Ya le he pedido a mi gestor que me ponga de admin.",
      [
        {
          sender: "assistant",
          content: "Contacta con tu account manager para que te dé acceso.",
        },
        {
          sender: "user",
          content: "Ya le he pedido a mi gestor que me ponga de admin.",
        },
      ],
      {},
      [],
      undefined,
      { agent_language: "es" },
    );

    expect(result.resolutionStatus).toBe("resolved");
    expect(result.responseText).toContain("Me alegra haber podido ayudarte.");
  });

  it.each([
    "Gracias, pero sigo sin ver Ingresos.",
    "Todo ok, ¿cómo descargo la factura?",
    "Gracias, necesito descargar la factura.",
    "No está resuelto.",
  ])("keeps unresolved or mixed messages in the answer flow: %s", async (message) => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "I can help with that.",
      answerable: true,
      replyLanguage: "en",
      model: "gpt-test",
      totalTokens: 4,
      promptAssembled: "assembled",
    });
    const result = await generateAnswer(
      message,
      [
        { sender: "assistant", content: "Go to the Ingresos section." },
        { sender: "user", content: message },
      ],
      {},
      [chunk],
      { generate } as AnswerProvider,
    );

    expect(generate).toHaveBeenCalled();
    expect(result.resolutionStatus).not.toBe("resolved");
  });

  it("uses the agent language for deterministic replies even when the visitor writes in English", async () => {
    const spanishGreeting = await generateAnswer(
      "Hello",
      [],
      {},
      [],
      undefined,
      { agent_language: "es", browser_language: "en-US" },
    );
    const frenchGreeting = await generateAnswer(
      "Bonjour",
      [],
      {},
      [],
      undefined,
      { agent_language: "fr", browser_language: "es-ES" },
    );
    const italianGreeting = await generateAnswer(
      "Ciao",
      [],
      {},
      [],
      undefined,
      { agent_language: "it", browser_language: "en-US" },
    );

    expect(spanishGreeting.responseText).toContain("asistente de soporte");
    expect(frenchGreeting.responseText).toContain("assistant d’assistance");
    expect(italianGreeting.responseText).toContain("assistente di supporto");
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
      { agent_language: "es", browser_language: "en-US" },
    );

    expect(result.shouldAskResolution).toBe(true);
    expect(result.responseText).toContain("¿Esta respuesta responde a tu pregunta?");
    expect(result.replyLanguage).toBe("es");
  });

  it("translates an English model reply when the agent language is Spanish", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Your invoice is ready.",
      answerable: true,
      replyLanguage: "en",
      model: "gpt-5-nano",
      totalTokens: 12,
      promptAssembled: "assembled",
      citations: [],
    });
    const translator = {
      translate: vi.fn(async () => "Tu factura está lista."),
    };

    const result = await generateAnswer(
      "Where is my invoice?",
      [{ sender: "user", content: "Where is my invoice?" }],
      {},
      [chunk],
      { generate } as AnswerProvider,
      { agent_language: "es", browser_language: "en-US" },
      translator,
    );

    expect(translator.translate).toHaveBeenCalledWith(
      "Your invoice is ready.",
      "es",
    );
    expect(result.responseText).toBe("Tu factura está lista.");
    expect(result.replyLanguage).toBe("es");
    expect(
      await alignReplyToAgentLanguage(
        "Tu factura está lista.",
        "es",
        "es",
        translator,
      ),
    ).toBe("Tu factura está lista.");
  });

  it("preserves a structured Spanish procedure without another translation call", async () => {
    const structuredAnswer =
      "Puedes consultar tus facturas así:\n1. Abre la sección Ingresos del menú lateral izquierdo.";
    const generate = vi.fn().mockResolvedValue({
      responseText: structuredAnswer,
      answerable: true,
      replyLanguage: "es",
      model: "gpt-test",
      totalTokens: 12,
      promptAssembled: "assembled",
    });
    const translator = { translate: vi.fn() };

    const result = await generateAnswer(
      "¿Cómo encuentro mis facturas?",
      [{ sender: "user", content: "¿Cómo encuentro mis facturas?" }],
      {},
      [chunk],
      { generate } as AnswerProvider,
      { agent_language: "es" },
      translator,
    );

    expect(result.responseText).toBe(structuredAnswer);
    expect(result.responseText.split("\n")).toHaveLength(2);
    expect(translator.translate).not.toHaveBeenCalled();
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
