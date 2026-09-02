import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiConnectorError, callConnector, callLiveDataEndpoint } from "./api-connector";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TEST_CONNECTOR_TOKEN;
});

describe("callConnector", () => {
  it("substitutes parameters and sends configured bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ order: "ready" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.TEST_CONNECTOR_TOKEN = "secret-token";

    const result = await callConnector({
      name: "Orders",
      endpointPattern: "https://example.test/orders/{order_id}",
      authType: "bearer",
      authConfig: { envVar: "TEST_CONNECTOR_TOKEN" },
    }, {
      query: "order status",
      params: { order_id: "123" },
    });

    expect(result).toMatchObject({ ok: true, status: 200, sourceName: "Orders" });
    const [requestUrl] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(requestUrl)).toBe("https://example.test/orders/123?query=order+status");
    expect(new Headers(request.headers).get("Authorization")).toBe("Bearer secret-token");
  });

  it("fails when configured credentials are missing", async () => {
    await expect(
      callConnector({
        name: "Orders",
        endpointPattern: "https://example.test/orders",
        authType: "api_key",
        authConfig: { envVar: "MISSING_CONNECTOR_TOKEN" },
      }, { query: "status" }),
    ).rejects.toBeInstanceOf(ApiConnectorError);
  });
});

describe("callLiveDataEndpoint", () => {
  it("calls the configured HTTPS URL with the selected method", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callLiveDataEndpoint({
      method: "POST",
      url: "https://example.test/api/v1/",
    });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      sourceName: "example.test",
    });
    const [requestUrl, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(requestUrl)).toBe("https://example.test/api/v1/");
    expect(request.method).toBe("POST");
  });

  it("rejects non-HTTPS live data URLs", async () => {
    await expect(
      callLiveDataEndpoint({ method: "GET", url: "http://example.test/api" }),
    ).rejects.toBeInstanceOf(ApiConnectorError);
  });
});
