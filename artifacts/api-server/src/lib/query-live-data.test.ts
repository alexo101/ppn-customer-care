import { afterEach, describe, expect, it } from "vitest";
import {
  detectLiveClientIntent,
  lookupLiveClient,
  readQueryLiveDataSettings,
  validateQueryLiveDataSettings,
  type QueryLiveDataSettings,
} from "./query-live-data";

const secretName = "LIVE_QUERY_TEST_TOKEN";
const settings: QueryLiveDataSettings = {
  endpointUrl: "https://api.example.com/clients?name={clientName}",
  authorizationSecretName: secretName,
  allowedFields: ["callStatus"],
  disambiguationFields: ["city"],
};

afterEach(() => {
  delete process.env[secretName];
});

describe("query live client data", () => {
  it("accepts only an HTTPS URL with one client-name placeholder and a prefixed secret name", () => {
    expect(validateQueryLiveDataSettings(settings)).toBeNull();
    expect(
      validateQueryLiveDataSettings({
        ...settings,
        endpointUrl: "http://api.example.com/clients?name={clientName}",
      }),
    ).toContain("HTTPS");
    expect(
      validateQueryLiveDataSettings({
        ...settings,
        endpointUrl: "https://api.example.com/clients?name={clientName}&copy={clientName}",
      }),
    ).toContain("exactly once");
    expect(
      validateQueryLiveDataSettings({
        ...settings,
        authorizationSecretName: "DATABASE_URL",
      }),
    ).toContain("LIVE_QUERY_");
    expect(
      validateQueryLiveDataSettings({
        ...settings,
        endpointUrl: "https://127.0.0.1/clients?name={clientName}",
      }),
    ).toContain("public HTTPS");
  });

  it("keeps general how-to questions on the knowledge-base path and asks for a name for a specific lookup", () => {
    expect(
      detectLiveClientIntent("Cómo sé si han llamado a mi cliente?", []),
    ).toEqual({ kind: "none" });
    expect(
      detectLiveClientIntent("¿Han llamado a mi cliente?", []),
    ).toEqual({ kind: "ask_name" });
    expect(
      detectLiveClientIntent("What is a client account?", []),
    ).toEqual({ kind: "none" });
    expect(
      detectLiveClientIntent("¿Han llamado a Ana García?", []),
    ).toEqual({
      kind: "lookup",
      clientName: "Ana García",
      continuation: false,
    });
  });

  it("reuses only the last assistant-confirmed client in a follow-up", () => {
    expect(
      detectLiveClientIntent("¿Y el estado de mi cliente?", [
        {
          sender: "assistant",
          content: "El contrato está activo.",
          metadata: {
            liveDataLookup: { status: "matched", clientName: "Ana García" },
          },
        },
      ]),
    ).toEqual({
      kind: "lookup",
      clientName: "Ana García",
      continuation: true,
    });
    expect(
      detectLiveClientIntent("How do I check contract status?", [
        {
          sender: "assistant",
          content: "El contrato está activo.",
          metadata: {
            liveDataLookup: { status: "matched", clientName: "Ana García" },
          },
        },
      ]),
    ).toEqual({ kind: "none" });
    expect(
      detectLiveClientIntent("¿Y el estado de mi cliente?", [
        { sender: "assistant", content: "Te explico el proceso." },
      ]),
    ).toEqual({ kind: "ask_name" });
  });

  it("uses a short clarification only after an ambiguous lookup", () => {
    expect(
      detectLiveClientIntent("the one in Madrid", [
        {
          sender: "assistant",
          content: "Which client do you mean?",
          metadata: {
            liveDataLookup: { status: "ambiguous", clientName: "Ana García" },
          },
        },
      ]),
    ).toEqual({
      kind: "lookup",
      clientName: "Ana García the one in Madrid",
      continuation: true,
    });
  });

  it("URL-encodes the name, sends the verified caller, filters fields, and requires an authorized unique result", async () => {
    process.env[secretName] = "test-only-token";
    const loadedSettings = readQueryLiveDataSettings({
      queryLiveData: settings,
    });
    expect(loadedSettings).toEqual(settings);
    let requestedUrl = "";
    let callerHeader = "";
    const result = await lookupLiveClient(
      loadedSettings,
      { userId: "user_123", agentId: "agent_456" },
      "Ana García",
      async (target, headers) => {
        requestedUrl = target.toString();
        callerHeader = headers["x-orchestrator-caller-id"];
        return {
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({
            authorized: true,
            authorizedForUserId: "user_123",
            clients: [
              {
                authorized: true,
                name: "Ana García",
                facts: {
                  callStatus: "completed",
                  city: "Madrid",
                  privateNotes: "not allowlisted",
                },
              },
            ],
          }),
        };
      },
    );

    expect(requestedUrl).toContain("Ana%20Garc%C3%ADa");
    expect(callerHeader).toBe("user_123");
    expect(result).toEqual({
      status: "matched",
      client: {
        name: "Ana García",
        facts: { callStatus: "completed" },
        disambiguation: { city: "Madrid" },
      },
    });
  });

  it("does not silently select the first duplicate or accept a response for another caller", async () => {
    process.env[secretName] = "test-only-token";
    const response = (authorizedForUserId: string) => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authorized: true,
        authorizedForUserId,
        clients: [
          { authorized: true, name: "Ana García", facts: { city: "Madrid" } },
          { authorized: true, name: "Ana García", facts: { city: "Valencia" } },
        ],
      }),
    });
    const transport = async () => response("user_123");
    const ambiguous = await lookupLiveClient(
      settings,
      { userId: "user_123", agentId: "agent_456" },
      "Ana García",
      transport,
    );
    expect(ambiguous).toMatchObject({
      status: "ambiguous",
      candidates: [
        { name: "Ana García", disambiguation: { city: "Madrid" } },
        { name: "Ana García", disambiguation: { city: "Valencia" } },
      ],
    });

    const unauthorized = await lookupLiveClient(
      settings,
      { userId: "user_123", agentId: "agent_456" },
      "Ana García",
      async () => response("user_999"),
    );
    expect(unauthorized).toEqual({ status: "unauthorized" });
  });
});
