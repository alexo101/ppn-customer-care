import { describe, expect, it } from "vitest";
import type { GroundedAnswerClaim, RetrievedChunk } from "./llm";
import { applyGuardrails } from "./guardrails";

const sourceText = [
  "Quiero que me contacten / Quiero que me llamen / Quiero hablar con mi agente o account manager.",
  "Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma de agencia.",
  "También puedes encontrar el número de teléfono de atención al cliente de Papernest en la parte inferior izquierda de tu plataforma.",
  "Contacta directamente con tu CSX para solicitar un callback.",
].join(" ");

const sourceChunk: RetrievedChunk = {
  sourceId: "article",
  sourceName: "Soporte y gestor de cuentas",
  content: sourceText,
  distance: 0.1,
};

function claim(
  text: string,
  evidenceQuote: string,
  format: GroundedAnswerClaim["format"] = "paragraph",
): GroundedAnswerClaim {
  return { text, evidenceQuote, citationIndex: 1, format };
}

describe("applyGuardrails", () => {
  it("blocks answers without retrieved passages", () => {
    const result = applyGuardrails("The answer is definitely yes.", {
      retrievedChunks: [],
      personAttributes: {},
    });

    expect(result.blocked).toBe(true);
    expect(result.actions).toContain("grounding_required");
  });

  it("requires evidence-backed claims and blocks when none are supplied", () => {
    const result = applyGuardrails("Ve a la sección Ingresos.", {
      retrievedChunks: [sourceChunk],
      personAttributes: {},
    });

    expect(result.blocked).toBe(true);
    expect(result.actions).toContain("grounded_claims_required");
  });

  it("redacts person attribute values from evidence-backed responses", () => {
    const chunk: RetrievedChunk = {
      sourceId: "article",
      sourceName: "Help Center",
      content: "Account email details.",
      distance: 0.1,
    };
    const result = applyGuardrails("Your account email is user@example.com.", {
      retrievedChunks: [chunk],
      personAttributes: { email: "user@example.com" },
      groundedClaims: [
        claim(
          "Your account email is user@example.com.",
          "Account email details.",
        ),
      ],
    });

    expect(result.responseText).toContain("[redacted]");
    expect(result.blocked).toBe(false);
    expect(result.actions).toContain("personal_data_redacted");
  });

  it("removes invented controls, suggested phrases, and numbers but keeps documented contact paths", () => {
    const result = applyGuardrails("Untrusted draft answer.", {
      retrievedChunks: [sourceChunk],
      personAttributes: {},
      groundedClaims: [
        claim(
          "Contacta directamente con tu CSX para solicitar un callback.",
          "Contacta directamente con tu CSX para solicitar un callback.",
          "step",
        ),
        claim(
          "Busca la opción para solicitar una llamada (por ejemplo: “Quiero que me llamen” / “Quiero hablar con mi agente”).",
          "Quiero que me contacten / Quiero que me llamen / Quiero hablar con mi agente o account manager.",
          "step",
        ),
        claim(
          "Llama al 900 123 456.",
          "También puedes encontrar el número de teléfono de atención al cliente de Papernest en la parte inferior izquierda de tu plataforma.",
          "step",
        ),
        claim(
          "También puedes encontrar el teléfono de atención al cliente de Papernest en la parte inferior izquierda de la plataforma.",
          "También puedes encontrar el número de teléfono de atención al cliente de Papernest en la parte inferior izquierda de tu plataforma.",
          "paragraph",
        ),
      ],
    });

    expect(result.blocked).toBe(false);
    expect(result.actions).toContain("unsupported_claims_removed");
    expect(result.responseText).toContain("Contacta directamente con tu CSX");
    expect(result.responseText).toContain("teléfono de atención al cliente");
    expect(result.responseText).not.toContain("opción");
    expect(result.responseText).not.toContain("por ejemplo");
    expect(result.responseText).not.toContain("900 123 456");
    expect(result.responseText).not.toContain("Quiero que me llamen");
  });

  it("keeps valid semantic paraphrases and only numbers genuinely plural step sequences", () => {
    const result = applyGuardrails("Untrusted draft answer.", {
      retrievedChunks: [sourceChunk],
      personAttributes: {},
      groundedClaims: [
        claim(
          "Localiza el contacto directo de tu agencia abajo a la izquierda.",
          "Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma de agencia.",
          "step",
        ),
        claim(
          "Después, contacta directamente con tu CSX.",
          "Contacta directamente con tu CSX para solicitar un callback.",
          "step",
        ),
      ],
    });

    expect(result.blocked).toBe(false);
    expect(result.responseText).toContain("1. Localiza el contacto directo");
    expect(result.responseText).toContain("2. Después, contacta");
  });

  it("replaces an unsupported setup action with the documented source instruction", () => {
    const evidence =
      "Puedes encontrar tu contacto directo en la parte inferior izquierda de la plataforma de agencia.";
    const result = applyGuardrails("Untrusted draft answer.", {
      retrievedChunks: [{
        sourceId: "article",
        sourceName: "Support",
        content: evidence,
        distance: 0.1,
      }],
      personAttributes: {},
      groundedClaims: [
        claim(
          "Abre la plataforma de agencia y localiza tu contacto directo en la parte inferior izquierda.",
          evidence,
          "step",
        ),
      ],
    });

    expect(result.blocked).toBe(false);
    expect(result.responseText).toBe(evidence);
    expect(result.responseText).not.toContain("Abre la plataforma");
  });

  it("accepts quoted interface labels only when the cited passage supports the control and label", () => {
    const chunk: RetrievedChunk = {
      sourceId: "article",
      sourceName: "Help Center",
      content: "Haz clic en el botón verde Añadir cliente.",
      distance: 0.1,
    };
    const supported = applyGuardrails("", {
      retrievedChunks: [chunk],
      personAttributes: {},
      groundedClaims: [
        claim(
          "Haz clic en el botón verde «Añadir cliente».",
          "Haz clic en el botón verde Añadir cliente.",
          "step",
        ),
      ],
    });
    const unsupported = applyGuardrails("", {
      retrievedChunks: [chunk],
      personAttributes: {},
      groundedClaims: [
        claim(
          "Selecciona la opción «Llamarme ahora».",
          "Haz clic en el botón verde Añadir cliente.",
          "step",
        ),
      ],
    });

    expect(supported.blocked).toBe(false);
    expect(supported.responseText).toBe("Haz clic en el botón verde «Añadir cliente».");
    expect(unsupported.blocked).toBe(true);
  });

  it("rejects an unquoted invented destination for a documented button type", () => {
    const evidence = "Haz clic en el botón verde Añadir cliente.";
    const result = applyGuardrails("Untrusted draft answer.", {
      retrievedChunks: [{
        sourceId: "article",
        sourceName: "Help Center",
        content: evidence,
        distance: 0.1,
      }],
      personAttributes: {},
      groundedClaims: [
        claim(
          "Haz clic en el botón Solicitar llamada.",
          evidence,
          "step",
        ),
      ],
    });

    expect(result.blocked).toBe(true);
    expect(result.responseText).not.toContain("Solicitar llamada");
  });

  it("keeps translated generic settings navigation valid without dropping destination checks", () => {
    const result = applyGuardrails("Untrusted draft.", {
      retrievedChunks: [{
        sourceId: "article",
        sourceName: "Help Center",
        content: "Invoices are in Settings.",
        distance: 0.1,
      }],
      personAttributes: {},
      groundedClaims: [
        claim(
          "Las facturas están en Ajustes.",
          "Invoices are in Settings.",
        ),
      ],
    });

    expect(result.blocked).toBe(false);
    expect(result.responseText).toBe("Las facturas están en Ajustes.");
  });

  it("rejects an unsupported destination for a settings control", () => {
    const evidence = "Open profile settings.";
    const result = applyGuardrails("Untrusted draft.", {
      retrievedChunks: [{
        sourceId: "article",
        sourceName: "Help Center",
        content: evidence,
        distance: 0.1,
      }],
      personAttributes: {},
      groundedClaims: [
        claim("Open billing settings.", evidence),
      ],
    });

    expect(result.blocked).toBe(true);
    expect(result.diagnostics.rejectionReasons).toContain(
      "unsupported_control_destination",
    );
  });

  it("accepts a supported settings destination", () => {
    const evidence = "Open billing settings.";
    const result = applyGuardrails("Untrusted draft.", {
      retrievedChunks: [{
        sourceId: "article",
        sourceName: "Help Center",
        content: evidence,
        distance: 0.1,
      }],
      personAttributes: {},
      groundedClaims: [
        claim("Open billing settings.", evidence),
      ],
    });

    expect(result.blocked).toBe(false);
    expect(result.responseText).toBe("Open billing settings.");
  });

  it("rejects an invented contact channel appended to a documented contact path", () => {
    const evidence =
      "Contacta directamente con tu CSX para solicitar un callback.";
    for (const instruction of [
      "Contacta directamente con tu CSX por WhatsApp para solicitar un callback.",
      "Contacta directamente con tu CSX en Facebook para solicitar un callback.",
      "Contacta directamente con tu CSX via Facebook para solicitar un callback.",
      "Contacta directamente con tu CSX through Facebook for a callback.",
    ]) {
      const result = applyGuardrails("Untrusted draft answer.", {
        retrievedChunks: [{
          sourceId: "article",
          sourceName: "Help Center",
          content: evidence,
          distance: 0.1,
        }],
        personAttributes: {},
        groundedClaims: [claim(instruction, evidence, "step")],
      });

      expect(result.blocked, instruction).toBe(true);
      expect(result.responseText).not.toMatch(/WhatsApp|Facebook/i);
      expect(result.diagnostics.rejectionReasons).toContain(
        "unsupported_contact_method",
      );
    }
  });

  it("validates live-data claims against an authorized fact pair", () => {
    const authorizedLiveData = {
      clientName: "Ana García",
      facts: { callStatus: "completed" },
    };
    const supported = applyGuardrails("Untrusted draft.", {
      retrievedChunks: [],
      personAttributes: {},
      hasAuthorizedLiveData: true,
      authorizedLiveData,
      groundedClaims: [
        {
          text: "La última llamada está completada.",
          evidenceQuote: '"callStatus":"completed"',
          citationIndex: null,
          format: "paragraph",
        },
      ],
    });
    const unsupported = applyGuardrails("Untrusted draft.", {
      retrievedChunks: [],
      personAttributes: {},
      hasAuthorizedLiveData: true,
      authorizedLiveData,
      groundedClaims: [
        {
          text: "El saldo pendiente es de 500 euros.",
          evidenceQuote: '"callStatus":"completed"',
          citationIndex: null,
          format: "paragraph",
        },
      ],
    });

    expect(supported.blocked).toBe(false);
    expect(supported.responseText).toBe("La última llamada está completada.");
    expect(unsupported.blocked).toBe(true);
  });
});
