import { describe, expect, it } from "vitest";
import { DEFAULT_WELCOME_MESSAGE } from "./conversation-auto-close";
import {
  hasRequiredWelcomeTokens,
  interpolateWelcomeMessage,
  isTrainingConversation,
  normalizeBrowserLanguage,
  translateWelcomeTemplate,
} from "./welcome-message";

describe("welcome message tokens", () => {
  it("accepts the default template", () => {
    expect(hasRequiredWelcomeTokens(DEFAULT_WELCOME_MESSAGE)).toBe(true);
  });

  it("rejects a message missing a required placeholder", () => {
    expect(
      hasRequiredWelcomeTokens("Hello {user_name}, how can I help you?"),
    ).toBe(false);
    expect(
      hasRequiredWelcomeTokens("You are speaking {agent_name}."),
    ).toBe(false);
  });
});

describe("interpolateWelcomeMessage", () => {
  it("replaces user and agent placeholders", () => {
    expect(
      interpolateWelcomeMessage(DEFAULT_WELCOME_MESSAGE, {
        userName: "Ada",
        agentName: "Nova",
      }),
    ).toBe("Hello Ada, you are speaking Nova Ai Agent. How can I help you?");
  });

  it("leaves unknown placeholders unchanged", () => {
    expect(
      interpolateWelcomeMessage("Hi {user_name} from {team}", {
        userName: "Lee",
        agentName: "Bot",
      }),
    ).toBe("Hi Lee from {team}");
  });
});

describe("isTrainingConversation", () => {
  it("is true only for training source metadata", () => {
    expect(isTrainingConversation({ source: "training" })).toBe(true);
    expect(isTrainingConversation({ source: "widget" })).toBe(false);
    expect(isTrainingConversation({})).toBe(false);
  });
});

describe("normalizeBrowserLanguage", () => {
  it("normalizes browser locale separators and casing", () => {
    expect(normalizeBrowserLanguage("ES_es")).toBe("es-es");
    expect(normalizeBrowserLanguage("en-US")).toBe("en-us");
  });

  it("rejects invalid or missing locales", () => {
    expect(normalizeBrowserLanguage("")).toBeNull();
    expect(normalizeBrowserLanguage("not a locale")).toBeNull();
    expect(normalizeBrowserLanguage(undefined)).toBeNull();
  });
});

describe("translateWelcomeTemplate", () => {
  it("translates configured text while preserving required tokens", async () => {
    const translator = {
      translate: async () =>
        "Hola {user_name}, habla con {agent_name}. ¿Cómo puedo ayudarte?",
    };

    await expect(
      translateWelcomeTemplate(
        "Hello {user_name}, you are speaking {agent_name}.",
        "es-ES",
        translator,
      ),
    ).resolves.toBe(
      "Hola {user_name}, habla con {agent_name}. ¿Cómo puedo ayudarte?",
    );
  });

  it("uses the configured template when translation fails", async () => {
    const template = "Hello {user_name}, you are speaking {agent_name}.";
    const translator = {
      translate: async () => {
        throw new Error("translator unavailable");
      },
    };

    await expect(
      translateWelcomeTemplate(template, "es", translator),
    ).resolves.toBe(template);
  });

  it("does not translate without a valid browser locale", async () => {
    const translator = { translate: async () => "unexpected" };
    const template = "Hello {user_name}, you are speaking {agent_name}.";

    await expect(
      translateWelcomeTemplate(template, undefined, translator),
    ).resolves.toBe(template);
  });
});
