import { logger } from "./logger";

type Connector = {
  name: string;
  endpointPattern: string;
  authType: string;
  authConfig: unknown;
};

export type ConnectorCallResult = {
  ok: boolean;
  status: number;
  body: unknown;
  sourceName: string;
};

export class ApiConnectorError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiConnectorError";
  }
}

export async function callConnector(
  connector: Connector,
  input: { query: string; params?: Record<string, unknown> },
): Promise<ConnectorCallResult> {
  const config = isPlainObject(connector.authConfig) ? connector.authConfig : {};
  const params = input.params ?? {};
  let endpoint = connector.endpointPattern;
  for (const [key, value] of Object.entries({ query: input.query, ...params })) {
    endpoint = endpoint.replace(
      new RegExp(`\\{${escapeRegExp(key)}\\}`, "g"),
      encodeURIComponent(String(value)),
    );
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch (error) {
    throw new ApiConnectorError(`Connector "${connector.name}" has an invalid endpoint URL.`, { cause: error });
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ApiConnectorError(`Connector "${connector.name}" must use HTTP or HTTPS.`);
  }
  if (endpoint.includes("{")) {
    throw new ApiConnectorError(`Connector "${connector.name}" has unresolved endpoint parameters.`);
  }
  if (!url.searchParams.has("query") && input.query.trim()) {
    url.searchParams.set("query", input.query);
  }

  const headers = new Headers({ accept: "application/json" });
  applyAuthentication(headers, connector, config);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Preserve non-JSON responses as text.
    }
    if (!response.ok) {
      logger.warn({ connector: connector.name, status: response.status }, "API connector returned an error");
    }
    return { ok: response.ok, status: response.status, body, sourceName: connector.name };
  } catch (error) {
    if (error instanceof ApiConnectorError) throw error;
    logger.warn({ connector: connector.name, error }, "API connector request failed");
    return { ok: false, status: 0, body: null, sourceName: connector.name };
  }
}

function applyAuthentication(
  headers: Headers,
  connector: Connector,
  config: Record<string, unknown>,
) {
  const authType = connector.authType.trim().toLowerCase();
  if (!authType || authType === "none") return;
  if (authType === "bearer" || authType === "api_key") {
    const envVar = readRequiredString(config.envVar, "envVar", connector.name);
    const token = readSecret(envVar, connector.name);
    const headerName = typeof config.headerName === "string" && config.headerName
      ? config.headerName
      : authType === "bearer" ? "Authorization" : "X-API-Key";
    headers.set(headerName, authType === "bearer" ? `Bearer ${token}` : token);
    return;
  }
  if (authType === "basic") {
    const username = readSecret(readRequiredString(config.usernameEnvVar, "usernameEnvVar", connector.name), connector.name);
    const password = readSecret(readRequiredString(config.passwordEnvVar, "passwordEnvVar", connector.name), connector.name);
    headers.set("Authorization", `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);
    return;
  }
  throw new ApiConnectorError(`Connector "${connector.name}" uses unsupported auth type "${connector.authType}".`);
}

function readSecret(envVar: string, connectorName: string): string {
  const value = process.env[envVar];
  if (!value) throw new ApiConnectorError(`Missing environment variable ${envVar} for connector "${connectorName}".`);
  return value;
}

function readRequiredString(value: unknown, key: string, connectorName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiConnectorError(`Connector "${connectorName}" requires authConfig.${key}.`);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
