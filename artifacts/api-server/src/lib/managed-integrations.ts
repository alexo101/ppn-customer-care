import { and, eq } from "drizzle-orm";
import { db, connectionsTable } from "@workspace/db";
import { decryptSecret } from "./connection-secrets";
import { IntegrationProviderError, type ConnectorProxy } from "./replit-integrations";

export async function createManagedIntegrationProxy(
  connectionId: string,
): Promise<ConnectorProxy> {
  const [connection] = await db
    .select()
    .from(connectionsTable)
    .where(and(
      eq(connectionsTable.id, connectionId),
      eq(connectionsTable.status, "connected"),
    ))
    .limit(1);
  if (!connection?.encryptedAccessToken) {
    throw new IntegrationProviderError("Connection is not available.", {
      code: "permission",
      status: 403,
    });
  }

  const token = decryptSecret(connection.encryptedAccessToken);
  const provider = connection.provider.toLowerCase();
  const baseUrl =
    typeof (connection.metadata as Record<string, unknown>)?.baseUrl === "string"
      ? (connection.metadata as Record<string, string>).baseUrl
      : provider === "notion"
        ? "https://api.notion.com"
        : "https://api.atlassian.com";

  return {
    async requestJson<T>(
      path: string,
      options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
    ) {
      const url = new URL(path, `${baseUrl.replace(/\/$/, "")}/`);
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          ...(provider === "notion" ? { "Notion-Version": "2022-06-28" } : {}),
          ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? "permission" : response.status === 404 ? "not_found" : "provider";
        throw new IntegrationProviderError(`Provider request failed (${response.status}).`, { code, status: response.status });
      }
      return body as T;
    },
  };
}
