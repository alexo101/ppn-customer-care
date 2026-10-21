import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listEligiblePublishedArticles,
  retrieveRelevantChunks,
  createAnswerProvider,
  createEmbeddingProvider,
  lookupLiveClient,
  selectLimit,
} = vi.hoisted(() => ({
  listEligiblePublishedArticles: vi.fn(),
  retrieveRelevantChunks: vi.fn(),
  createAnswerProvider: vi.fn(),
  createEmbeddingProvider: vi.fn(),
  lookupLiveClient: vi.fn(),
  selectLimit: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: selectLimit,
        }),
      }),
    }),
  },
  agentSettingsTable: { agentId: "agentId" },
}));

vi.mock("./retrieval", async () => {
  const actual =
    await vi.importActual<typeof import("./retrieval")>("./retrieval");
  return {
    ...actual,
    listEligiblePublishedArticles,
    retrieveRelevantChunks,
  };
});

vi.mock("./query-live-data", async () => {
  const actual =
    await vi.importActual<typeof import("./query-live-data")>(
      "./query-live-data",
    );
  return { ...actual, lookupLiveClient };
});

vi.mock("./llm/openai-welcome-message-translator", () => ({
  OpenAIWelcomeMessageTranslator: class {
    async translate() {
      throw new Error("translator unavailable");
    }
  },
}));

vi.mock("./llm", async () => {
  const actual = await vi.importActual<typeof import("./llm")>("./llm");
  return {
    ...actual,
    createAnswerProvider,
    createEmbeddingProvider,
  };
});

import {
  answerFromKnowledge,
  buildKnowledgeRetrievalQuery,
} from "./answer-question";

const person = { personType: "user" as const, attributes: {} };
const baseInput = {
  message: "Where is my invoice?",
  history: [{ sender: "user", content: "Where is my invoice?" }],
  agentId: "agent-1",
  person,
  context: {},
  replyLocaleCandidates: [],
  userName: "Ada",
  escalationTemplate: "{user_name}, I can connect you with a person.",
};

describe("answerFromKnowledge", () => {
  beforeEach(() => {
    listEligiblePublishedArticles.mockReset();
    retrieveRelevantChunks.mockReset();
    createAnswerProvider.mockReset();
    createEmbeddingProvider.mockReset();
    lookupLiveClient.mockReset();
    selectLimit.mockReset();
    selectLimit.mockResolvedValue([]);
    createEmbeddingProvider.mockReturnValue({ embed: vi.fn() });
  });

  it("adds a strongly related earlier user question to retrieval but not an unrelated topic", () => {
    const history = [
      { sender: "user", content: "Cómo encuentro mis facturas?" },
      { sender: "assistant", content: "Go to Ingresos." },
      {
        sender: "assistant",
        content: "I could not answer that.",
        metadata: { kind: "unable_to_answer", actions: ["escalate"] },
      },
      { sender: "user", content: "Como encuentro las facturas?" },
    ];
    expect(
      buildKnowledgeRetrievalQuery("Como encuentro las facturas?", history),
    ).toBe("Cómo encuentro mis facturas?");

    expect(
      buildKnowledgeRetrievalQuery("¿Cómo añado un cliente?", [
        { sender: "user", content: "Cómo encuentro mis facturas?" },
        { sender: "user", content: "¿Cómo añado un cliente?" },
      ]),
    ).toBe("¿Cómo añado un cliente?");
  });

  it("handles an acknowledged account-manager instruction before searching the knowledge base", async () => {
    const message = "todo ok le he pedido a mi gestor que me ponga de admin";
    const result = await answerFromKnowledge({
      ...baseInput,
      message,
      history: [
        { sender: "user", content: "No veo la sección Ingresos." },
        {
          sender: "assistant",
          content: "Contacta con tu account manager para que te dé acceso.",
        },
        { sender: "user", content: message },
      ],
      context: { agent_language: "es" },
    });

    expect(listEligiblePublishedArticles).not.toHaveBeenCalled();
    expect(retrieveRelevantChunks).not.toHaveBeenCalled();
    expect(createAnswerProvider).not.toHaveBeenCalled();
    expect(result.responseText).toBe(
      "Me alegra haber podido ayudarte. Si necesitas algo más, aquí estoy.",
    );
    expect(result.resolutionStatus).toBe("resolved");
    expect(result.shouldAskResolution).toBe(false);
    expect(result.assistantMetadata).toEqual({ citations: [] });
  });

  it("recognizes that the user will pass on the advice without searching the knowledge base", async () => {
    const message = "Vale ok se lo digo, gracias";
    const result = await answerFromKnowledge({
      ...baseInput,
      message,
      history: [
        { sender: "assistant", content: "Contacta con tu account manager para que te dé acceso." },
        { sender: "user", content: message },
      ],
      context: { agent_language: "es" },
    });

    expect(listEligiblePublishedArticles).not.toHaveBeenCalled();
    expect(retrieveRelevantChunks).not.toHaveBeenCalled();
    expect(createAnswerProvider).not.toHaveBeenCalled();
    expect(result.resolutionStatus).toBe("resolved");
    expect(result.responseText).toBe(
      "Me alegra haber podido ayudarte. Si necesitas algo más, aquí estoy.",
    );
    expect(result.assistantMetadata).toEqual({ citations: [] });
  });

  it("resolves a standalone thank-you without searching or offering escalation", async () => {
    const message = "Thanks for your help!";
    const result = await answerFromKnowledge({
      ...baseInput,
      message,
      history: [
        { sender: "assistant", content: "You can find your invoices in Income." },
        { sender: "user", content: message },
      ],
      context: { agent_language: "en" },
    });

    expect(listEligiblePublishedArticles).not.toHaveBeenCalled();
    expect(retrieveRelevantChunks).not.toHaveBeenCalled();
    expect(createAnswerProvider).not.toHaveBeenCalled();
    expect(result.resolutionStatus).toBe("resolved");
    expect(result.responseText).toContain("I'm glad I could help.");
    expect(result.responseText).not.toContain("couldn't find enough information");
    expect(result.responseText).not.toContain("connect you with a person");
  });

  it("answers a repeated invoice question from retrieval without carrying an earlier refusal", async () => {
    const invoiceChunk = {
      sourceId: "billing-article",
      sourceName: "Pagos y facturación (agentes)",
      articleId: "billing-article",
      articleName: "Pagos y facturación (agentes)",
      content:
        "¿Cómo puedo ver mis facturas? Para ver tus facturas de agente ve a la sección Ingresos en el menú lateral izquierdo.",
      distance: 0.1,
    };
    const question = "Como encuentro las facturas?";
    const history = [
      { sender: "user", content: "Cómo encuentro mis facturas?" },
      { sender: "assistant", content: "Ve a la sección Ingresos." },
      { sender: "user", content: "No veo la sección Ingresos." },
      {
        sender: "assistant",
        content: "No he encontrado suficiente información.",
        metadata: { kind: "unable_to_answer", actions: ["escalate"] },
      },
      { sender: "user", content: question },
    ];
    const generate = vi.fn().mockResolvedValue({
      responseText: "Ve a Ingresos en el menú lateral para consultar tus facturas.",
      answerable: true,
      replyLanguage: "es",
      model: "gpt-test",
      totalTokens: 8,
      promptAssembled: "prompt",
      citations: [{ articleId: "billing-article", articleName: "Pagos y facturación (agentes)" }],
      groundedClaims: [{
        text: "Ve a Ingresos en el menú lateral para consultar tus facturas.",
        evidenceQuote:
          "Para ver tus facturas de agente ve a la sección Ingresos en el menú lateral izquierdo.",
        citationIndex: 1,
        format: "paragraph",
      }],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "billing-article", title: "Pagos y facturación (agentes)", targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [invoiceChunk],
      totalTokens: 4,
      model: "embed-test",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge({
      ...baseInput,
      message: question,
      history,
      context: { agent_language: "es" },
    });

    expect(retrieveRelevantChunks).toHaveBeenCalledWith(
      ["billing-article"],
      "Cómo encuentro mis facturas?",
      expect.anything(),
      5,
      { agentId: "agent-1" },
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: question,
        retrievedChunks: [invoiceChunk],
        history: [
          { role: "user", content: "Cómo encuentro mis facturas?" },
          { role: "assistant", content: "Ve a la sección Ingresos." },
          { role: "user", content: "No veo la sección Ingresos." },
        ],
      }),
    );
    expect(result.answerable).toBe(true);
    expect(result.responseText).toContain("Ve a Ingresos");
    expect(result.articleIds).toEqual(["billing-article"]);
  });

  it("answers an exact documented callback FAQ without depending on model output", async () => {
    const supportChunk = {
      sourceId: "support-article",
      sourceName: "Soporte y gestor de cuentas (agentes)",
      articleId: "support-article",
      articleName: "Soporte y gestor de cuentas (agentes)",
      content:
        "Quiero que me contacten / Quiero que me llamen / Quiero hablar con mi agente o account manager. Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma de agencia. También puedes encontrar el número de teléfono de atención al cliente de Papernest en la parte inferior izquierda de tu plataforma.",
      distance: 0.1,
    };
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "support-article", title: supportChunk.articleName, targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [supportChunk],
      totalTokens: 4,
      model: "embed-test",
    });

    const result = await answerFromKnowledge({
      ...baseInput,
      message: "Quiero que me llamen",
      history: [{ sender: "user", content: "Quiero que me llamen" }],
      context: { agent_language: "es" },
    });

    expect(createAnswerProvider).not.toHaveBeenCalled();
    expect(result.answerable).toBe(true);
    expect(result.responseText).toBe(
      "Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma de agencia.",
    );
    expect(result.internalDiagnostics).toMatchObject({
      outcome: "answered_from_exact_faq",
    });
    expect(result.assistantMetadata.citations).toHaveLength(1);
  });

  it("does not use an exact FAQ fallback when the source language differs from the agent language", async () => {
    const supportChunk = {
      sourceId: "support-article",
      sourceName: "Support",
      content:
        "I want a callback. You can find your account manager at the bottom left of the platform.",
      distance: 0.1,
    };
    const generate = vi.fn().mockResolvedValue({
      responseText: "I could not verify that.",
      answerable: false,
      model: "gpt-test",
      totalTokens: 3,
      promptAssembled: "prompt",
      groundedClaims: [],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "support-article", title: "Support", targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [supportChunk],
      totalTokens: 4,
      model: "embed-test",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge({
      ...baseInput,
      message: "I want a callback",
      history: [{ sender: "user", content: "I want a callback" }],
      context: { agent_language: "es" },
    });

    expect(generate).toHaveBeenCalled();
    expect(result.answerable).toBe(false);
  });

  it("answers a documented missing-menu question with the access requirement", async () => {
    const question = "No veo la sección Ingresos.";
    const billingChunk = {
      sourceId: "billing-article",
      sourceName: "Pagos y facturación (agentes)",
      articleId: "billing-article",
      articleName: "Pagos y facturación (agentes)",
      content:
        "No veo la sección Ingresos en mi agencia. Para ver la sección Ingresos tienes que ser el Admin de tu agencia. Contacta con tu account manager para que lo configure; puedes encontrar su contacto en la esquina inferior izquierda.",
      distance: 0.1,
    };
    const generate = vi.fn().mockResolvedValue({
      responseText:
        "Para ver Ingresos necesitas ser Admin de tu agencia. Si no eres Admin, contacta con tu account manager; encontrarás su contacto en la esquina inferior izquierda.",
      answerable: true,
      replyLanguage: "es",
      model: "gpt-test",
      totalTokens: 8,
      promptAssembled: "prompt",
      citations: [{ articleId: "billing-article", articleName: "Pagos y facturación (agentes)" }],
      groundedClaims: [
        {
          text: "Para ver Ingresos necesitas ser Admin de tu agencia.",
          evidenceQuote:
            "Para ver la sección Ingresos tienes que ser el Admin de tu agencia.",
          citationIndex: 1,
          format: "paragraph",
        },
        {
          text: "Si no eres Admin, contacta con tu account manager; encontrarás su contacto en la esquina inferior izquierda.",
          evidenceQuote:
            "Contacta con tu account manager para que lo configure; puedes encontrar su contacto en la esquina inferior izquierda.",
          citationIndex: 1,
          format: "paragraph",
        },
      ],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "billing-article", title: "Pagos y facturación (agentes)", targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [billingChunk],
      totalTokens: 4,
      model: "embed-test",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge({
      ...baseInput,
      message: question,
      history: [
        { sender: "user", content: "Cómo encuentro mis facturas?" },
        { sender: "assistant", content: "Ve a Ingresos en el menú lateral." },
        { sender: "user", content: question },
      ],
      context: { agent_language: "es" },
    });

    expect(retrieveRelevantChunks).toHaveBeenCalledWith(
      ["billing-article"],
      question,
      expect.anything(),
      5,
      { agentId: "agent-1" },
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: question,
        retrievedChunks: [billingChunk],
      }),
    );
    expect(result.answerable).toBe(true);
    expect(result.responseText).toContain("ser Admin");
    expect(result.responseText).toContain("account manager");
    expect(result.responseText).not.toContain("agency is payable");
  });

  it("removes unsupported callback controls while keeping documented contact paths", async () => {
    const supportChunk = {
      sourceId: "support-article",
      sourceName: "Soporte y gestor de cuentas (agentes)",
      articleId: "support-article",
      articleName: "Soporte y gestor de cuentas (agentes)",
      content:
        "Quiero que me contacten / Quiero que me llamen / Quiero hablar con mi agente o account manager. Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma de agencia. También puedes encontrar el número de teléfono de atención al cliente de Papernest en la parte inferior izquierda de tu plataforma. Necesito hacer un cambio en un cliente o solicitar un callback. Contacta directamente con tu CSX.",
      distance: 0.1,
    };
    const generate = vi.fn().mockResolvedValue({
      responseText:
        "Busca la opción para solicitar una llamada (por ejemplo: “Quiero que me llamen” / “Quiero hablar con mi agente”).",
      answerable: true,
      replyLanguage: "es",
      model: "gpt-test",
      totalTokens: 8,
      promptAssembled: "prompt",
      citations: [],
      groundedClaims: [
        {
          text: "Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma de agencia.",
          evidenceQuote:
            "Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma de agencia.",
          citationIndex: 1,
          format: "paragraph",
        },
        {
          text: "Busca la opción para solicitar una llamada (por ejemplo: “Quiero que me llamen” / “Quiero hablar con mi agente”).",
          evidenceQuote:
            "Quiero que me contacten / Quiero que me llamen / Quiero hablar con mi agente o account manager.",
          citationIndex: 1,
          format: "step",
        },
        {
          text: "También puedes encontrar el número de teléfono de atención al cliente de Papernest en la parte inferior izquierda de tu plataforma.",
          evidenceQuote:
            "También puedes encontrar el número de teléfono de atención al cliente de Papernest en la parte inferior izquierda de tu plataforma.",
          citationIndex: 1,
          format: "paragraph",
        },
      ],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "support-article", title: supportChunk.articleName, targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [supportChunk],
      totalTokens: 4,
      model: "embed-test",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge({
      ...baseInput,
      message: "¿Dónde puedo encontrar a mi gestor?",
      history: [
        { sender: "user", content: "¿Dónde puedo encontrar a mi gestor?" },
      ],
      context: { agent_language: "es" },
    });

    expect(result.answerable).toBe(true);
    expect(result.responseText).toContain("contacto directo");
    expect(result.responseText).toContain("número de teléfono");
    expect(result.responseText).not.toContain("Busca la opción");
    expect(result.responseText).not.toContain("por ejemplo");
    expect(result.responseText).not.toContain("Quiero hablar con mi agente");
    expect(result.stages[3]?.details.guardrails).toContain(
      "unsupported_claims_removed",
    );
  });

  it("offers escalation when no published article is eligible", async () => {
    listEligiblePublishedArticles.mockResolvedValue([]);

    const result = await answerFromKnowledge(baseInput);

    expect(retrieveRelevantChunks).not.toHaveBeenCalled();
    expect(createAnswerProvider).not.toHaveBeenCalled();
    expect(result.answerable).toBe(false);
    expect(result.responseText).toContain("Ada, I couldn't find enough information");
    expect(result.responseText).toContain("Ada, I can connect you with a person.");
    expect(result.internalDiagnostics).toEqual({
      outcome: "no_retrieved_passages",
      retrievedChunkCount: 0,
    });
    expect(result.assistantMetadata).toMatchObject({
      kind: "unable_to_answer",
      actions: ["escalate"],
      citations: [],
    });
    expect(result.assistantMetadata).not.toHaveProperty("diagnostics");
  });

  it("does not answer from chunks that fail retrieval", async () => {
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "article-1", title: "Billing", targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({ chunks: [], totalTokens: 3, model: "embed" });

    const result = await answerFromKnowledge(baseInput);

    expect(result.answerable).toBe(false);
    expect(result.assistantMetadata).toMatchObject({ actions: ["escalate"] });
    expect(createAnswerProvider).not.toHaveBeenCalled();
  });

  it("discards an unanswerable model reply and offers escalation", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "I invented an account balance of $40.",
      answerable: false,
      model: "gpt-test",
      totalTokens: 8,
      promptAssembled: "prompt",
      citations: [{ articleId: "article-1", articleName: "Billing" }],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "article-1", title: "Billing", targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [
        {
          sourceId: "article-1",
          sourceName: "Billing",
          articleId: "article-1",
          articleName: "Billing",
          content: "Invoices are in Settings.",
          distance: 0.2,
        },
      ],
      totalTokens: 4,
      model: "embed",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge(baseInput);

    expect(result.answerable).toBe(false);
    expect(result.responseText).not.toContain("$40");
    expect(result.responseText).toContain("couldn't find enough information");
    expect(result.assistantMetadata).toMatchObject({ actions: ["escalate"], citations: [] });
    expect(result.internalDiagnostics).toMatchObject({
      outcome: "model_declined",
      evidence: {
        claimsReceived: 0,
        claimsAccepted: 0,
      },
    });
    expect(result.assistantMetadata).not.toHaveProperty("diagnostics");
    expect(result.articlesUsed).toEqual(["Billing"]);
  });

  it("records evidence rejection separately from retrieval and model refusal", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Ve a la sección de Facebook para consultar el estado.",
      answerable: true,
      model: "gpt-test",
      totalTokens: 8,
      promptAssembled: "prompt",
      groundedClaims: [{
        text: "Ve a la sección de Facebook para consultar el estado.",
        evidenceQuote: "This quoted passage is not in the retrieved article.",
        citationIndex: 1,
        format: "step",
      }],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "article-1", title: "Client status", targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [{
        sourceId: "article-1",
        sourceName: "Client status",
        articleId: "article-1",
        articleName: "Client status",
        content: "The contract status appears in the client table.",
        distance: 0.1,
      }],
      totalTokens: 4,
      model: "embed",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge(baseInput);

    expect(result.answerable).toBe(false);
    expect(result.articlesUsed).toEqual(["Client status"]);
    expect(result.internalDiagnostics).toMatchObject({
      outcome: "all_grounded_claims_rejected",
      provider: { status: "not_reported" },
      evidence: {
        claimsReceived: 1,
        claimsAccepted: 0,
        rejectionReasons: ["evidence_quote_not_in_cited_chunk"],
      },
    });
    expect(result.assistantMetadata).not.toHaveProperty("diagnostics");
  });

  it("returns a grounded answer with article citations", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Invoices are in Settings.",
      answerable: true,
      model: "gpt-test",
      totalTokens: 8,
      promptAssembled: "prompt",
      groundedClaims: [{
        text: "Invoices are in Settings.",
        evidenceQuote: "Invoices are in Settings.",
        citationIndex: 1,
        format: "paragraph",
      }],
      citations: [
        {
          articleId: "article-1",
          articleName: "Billing",
          sourceId: "article-1",
          sourceName: "Billing",
          assetId: "asset-1",
        },
      ],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "article-1", title: "Billing", targetId: "target-1" },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [
        {
          sourceId: "article-1",
          sourceName: "Billing",
          articleId: "article-1",
          articleName: "Billing",
          content: "Invoices are in Settings.",
          distance: 0.1,
        },
      ],
      totalTokens: 4,
      model: "embed",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge(baseInput);

    expect(result.answerable).toBe(true);
    expect(result.responseText).toContain("Invoices are in Settings.");
    expect(result.articleIds).toEqual(["article-1"]);
    expect(result.assistantMetadata).toMatchObject({
      citations: [
        expect.objectContaining({
          articleId: "article-1",
          articleName: "Billing",
          assetId: "asset-1",
        }),
      ],
    });
    expect(result.internalDiagnostics).toMatchObject({
      outcome: "answered",
      provider: { status: "not_reported" },
      evidence: {
        claimsReceived: 1,
        claimsAccepted: 1,
        rejectionReasons: [],
      },
    });
    expect(result.assistantMetadata).not.toHaveProperty("diagnostics");
  });

  it("keeps Training replies in the saved agent language when the browser and question are English", async () => {
    listEligiblePublishedArticles.mockResolvedValue([]);

    const result = await answerFromKnowledge({
      ...baseInput,
      message: "Where is my invoice?",
      context: { agent_language: "es", browser_language: "en-US" },
      replyLocaleCandidates: ["en-US", "es"],
    });

    expect(result.responseText).toContain("no he encontrado suficiente información");
    expect(result.responseText).toContain("agente de soporte");
    expect(result.responseText).not.toContain("couldn't find enough information");
  });

  it("asks the answer model to use the saved language instead of the browser language", async () => {
    const generate = vi.fn().mockResolvedValue({
      responseText: "Las facturas están en Ajustes.",
      answerable: true,
      replyLanguage: "es",
      model: "gpt-test",
      totalTokens: 8,
      promptAssembled: "prompt",
      citations: [],
      groundedClaims: [{
        text: "Las facturas están en Ajustes.",
        evidenceQuote: "Invoices are in Settings.",
        citationIndex: 1,
        format: "paragraph",
      }],
    });
    listEligiblePublishedArticles.mockResolvedValue([
      { id: "article-1", title: "Billing", targetId: null },
    ]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [
        {
          sourceId: "article-1",
          sourceName: "Billing",
          articleId: "article-1",
          articleName: "Billing",
          content: "Invoices are in Settings.",
          distance: 0.1,
        },
      ],
      totalTokens: 4,
      model: "embed",
    });
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge({
      ...baseInput,
      message: "Where is my invoice?",
      context: { agent_language: "es", browser_language: "en-US" },
      replyLocaleCandidates: ["en-US"],
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ agent_language: "es" }),
        message: "Where is my invoice?",
      }),
    );
    expect(result.responseText).toContain("Las facturas están en Ajustes.");
  });

  it("retrieves a Spanish question's eligible article and sends its passage to AI in Spanish", async () => {
    const question = "¿Cómo puedo cancelar el servicio?";
    const article = { id: "article-1", title: "Cancelaciones", targetId: null };
    const retrievedChunk = {
      sourceId: article.id,
      sourceName: article.title,
      articleId: article.id,
      articleName: article.title,
      chunkId: "chunk-1",
      content: "To cancel, open Account settings and select Cancel service.",
      distance: 0.12,
    };
    const embeddingProvider = { embed: vi.fn() };
    const generate = vi.fn().mockResolvedValue({
      responseText: "Para cancelar, abre la configuración de la cuenta y selecciona Cancelar servicio.",
      answerable: true,
      replyLanguage: "es",
      model: "gpt-test",
      totalTokens: 12,
      promptAssembled: "Spanish question with retrieved article context",
      citations: [
        {
          sourceId: article.id,
          sourceName: article.title,
          articleId: article.id,
          articleName: article.title,
          chunkId: retrievedChunk.chunkId,
          excerpt: retrievedChunk.content,
        },
      ],
      groundedClaims: [{
        text: "Para cancelar, abre la configuración de la cuenta y selecciona Cancelar servicio.",
        evidenceQuote:
          "To cancel, open Account settings and select Cancel service.",
        citationIndex: 1,
        format: "paragraph",
      }],
    });
    listEligiblePublishedArticles.mockResolvedValue([article]);
    retrieveRelevantChunks.mockResolvedValue({
      chunks: [retrievedChunk],
      totalTokens: 5,
      model: "embed-test",
    });
    createEmbeddingProvider.mockReturnValue(embeddingProvider);
    createAnswerProvider.mockReturnValue({ generate });

    const result = await answerFromKnowledge({
      ...baseInput,
      message: question,
      context: { agent_language: "es", browser_language: "en-US" },
      replyLocaleCandidates: ["en-US"],
    });

    expect(listEligiblePublishedArticles).toHaveBeenCalledWith(
      "agent-1",
      person,
    );
    expect(retrieveRelevantChunks).toHaveBeenCalledWith(
      [article.id],
      question,
      embeddingProvider,
      5,
      { agentId: "agent-1" },
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: question,
        retrievedChunks: [retrievedChunk],
        context: expect.objectContaining({ agent_language: "es" }),
      }),
    );
    expect(result.responseText).toContain("Para cancelar");
    expect(result.articlesUsed).toEqual([article.title]);
    expect(result.articleIds).toEqual([article.id]);
    expect(result.assistantMetadata).toMatchObject({
      citations: [expect.objectContaining({ articleId: article.id })],
    });
    expect(result.stages[2]?.details).toMatchObject({
      chunks_retrieved: 1,
      articles: [article.title],
    });
  });

  it("continues a client-name clarification into an authorized lookup in the same conversation", async () => {
    const configuration = {
      queryLiveData: {
        endpointUrl: "https://api.example.com/clients?name={clientName}",
      },
    };
    selectLimit.mockResolvedValue([{ configuration }]);

    const firstTurn = await answerFromKnowledge({
      ...baseInput,
      message: "¿Han llamado a mi cliente?",
      history: [{ sender: "user", content: "¿Han llamado a mi cliente?" }],
      caller: { userId: "user_123", agentId: "agent-1" },
      context: { agent_language: "es" },
    });
    expect(firstTurn.responseText).toContain("¿De qué cliente");
    expect(firstTurn.assistantMetadata).toMatchObject({
      liveDataLookup: { status: "awaiting_name" },
    });
    expect(lookupLiveClient).not.toHaveBeenCalled();

    const generate = vi.fn().mockResolvedValue({
      responseText: "La última llamada está completada.",
      answerable: true,
      replyLanguage: "es",
      model: "gpt-test",
      totalTokens: 7,
      promptAssembled: "private live values",
      citations: [],
      groundedClaims: [{
        text: "La última llamada está completada.",
        evidenceQuote: '"callStatus":"completed"',
        citationIndex: null,
        format: "paragraph",
      }],
    });
    createAnswerProvider.mockReturnValue({ generate });
    lookupLiveClient.mockResolvedValue({
      status: "matched",
      client: {
        name: "Ana García",
        facts: { callStatus: "completed" },
      },
    });
    const secondTurn = await answerFromKnowledge({
      ...baseInput,
      message: "Ana García",
      history: [
        { sender: "user", content: "¿Han llamado a mi cliente?" },
        {
          sender: "assistant",
          content: firstTurn.responseText,
          metadata: firstTurn.assistantMetadata,
        },
        { sender: "user", content: "Ana García" },
      ],
      caller: { userId: "user_123", agentId: "agent-1" },
      context: { agent_language: "es" },
    });

    expect(lookupLiveClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointUrl: "https://api.example.com/clients?name={clientName}",
      }),
      { userId: "user_123", agentId: "agent-1" },
      "Ana García",
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        liveData: {
          clientName: "Ana García",
          facts: { callStatus: "completed" },
        },
      }),
    );
    expect(secondTurn.responseText).toContain("La última llamada");
    expect(secondTurn.promptAssembled).not.toContain("private live values");
  });
});
