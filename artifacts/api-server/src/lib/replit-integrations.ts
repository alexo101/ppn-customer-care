import { ReplitConnectors, type ProxyOptions } from "@replit/connectors-sdk";

export const SOURCE_INTEGRATIONS = [
  { connectorName: "notion", displayName: "Notion" },
  { connectorName: "confluence", displayName: "Confluence" },
] as const;

export type SourceIntegrationName = (typeof SOURCE_INTEGRATIONS)[number]["connectorName"];

export type SourceIntegrationStatus = {
  connectorName: SourceIntegrationName;
  displayName: string;
  connected: boolean;
  connectionId: string | null;
  status: string | null;
};

export type ConnectorProxy = {
  requestJson<T>(
    path: string,
    options?: { method?: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<T>;
};

export class IntegrationProviderError extends Error {
  readonly status?: number;
  readonly code: "disconnected" | "permission" | "rate_limit" | "provider" | "not_found";

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: "disconnected" | "permission" | "rate_limit" | "provider" | "not_found";
      cause?: unknown;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "IntegrationProviderError";
    this.status = options?.status;
    this.code = options?.code ?? "provider";
  }
}

function matchesConnector(
  connection: { connector_name?: string; connector?: { name?: string; display_name?: string } },
  name: string,
) {
  const haystacks = [
    connection.connector_name,
    connection.connector?.name,
    connection.connector?.display_name,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return haystacks.some((value) => value === name || value.includes(name));
}

export function isSourceIntegrationName(value: string): value is SourceIntegrationName {
  return SOURCE_INTEGRATIONS.some((item) => item.connectorName === value);
}

export function createConnectorsClient(): ReplitConnectors {
  return new ReplitConnectors();
}

export async function listSourceIntegrations(): Promise<SourceIntegrationStatus[]> {
  let connections: Awaited<ReturnType<ReplitConnectors["listConnections"]>> = [];

  try {
    const client = createConnectorsClient();
    connections = await client.listConnections({
      connector_names: SOURCE_INTEGRATIONS.map((item) => item.connectorName).join(","),
      expand: ["connector"],
    });
  } catch {
    connections = [];
  }

  return SOURCE_INTEGRATIONS.map((item) => {
    const connection = connections.find((candidate) => matchesConnector(candidate, item.connectorName));
    const connected = Boolean(connection) && connection?.status !== "disconnected";
    return {
      connectorName: item.connectorName,
      displayName: item.displayName,
      connected,
      connectionId: connection?.id ?? null,
      status: connection?.status ?? null,
    };
  });
}

export async function getSourceIntegration(connectorName: string): Promise<SourceIntegrationStatus | null> {
  const integrations = await listSourceIntegrations();
  return integrations.find((item) => item.connectorName === connectorName) ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorFromStatus(connectorName: string, status: number, body: string): IntegrationProviderError {
  if (status === 401 || status === 403) {
    return new IntegrationProviderError(
      `Access to ${connectorName} was denied. Reconnect it in Replit Integrations or choose content you can access.`,
      { status, code: "permission" },
    );
  }
  if (status === 404) {
    return new IntegrationProviderError(`The requested ${connectorName} content was not found.`, {
      status,
      code: "not_found",
    });
  }
  if (status === 429) {
    return new IntegrationProviderError(`${connectorName} is rate limited. Try again in a moment.`, {
      status,
      code: "rate_limit",
    });
  }
  const detail = body.trim().slice(0, 240);
  return new IntegrationProviderError(
    detail
      ? `${connectorName} request failed (${status}): ${detail}`
      : `${connectorName} request failed (${status}).`,
    { status, code: "provider" },
  );
}

export async function proxyConnectorJson<T>(
  connectorName: string,
  path: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<T> {
  const client = createConnectorsClient();
  const proxyOptions: ProxyOptions = {
    method: options?.method ?? (options?.body !== undefined ? "POST" : "GET"),
    body: options?.body,
    headers: options?.headers,
  };
  let lastError: IntegrationProviderError | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await client.proxy(connectorName, path, proxyOptions);
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * (attempt + 1));
      continue;
    }
    const text = await response.text();
    if (!response.ok) {
      lastError = errorFromStatus(connectorName, response.status, text);
      if (lastError.code === "rate_limit" && attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw lastError;
    }
    if (!text.trim()) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new IntegrationProviderError(`${connectorName} returned a response that was not JSON.`, {
        status: response.status,
        code: "provider",
        cause: error,
      });
    }
  }

  throw lastError ?? new IntegrationProviderError(`${connectorName} request failed.`);
}

export function createReplitConnectorProxy(connectorName: string): ConnectorProxy {
  return {
    requestJson: (path, options) => proxyConnectorJson(connectorName, path, options),
  };
}
