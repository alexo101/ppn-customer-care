import { ReplitConnectors } from "@replit/connectors-sdk";

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

function matchesConnector(connection: { connector_name?: string; connector?: { name?: string; display_name?: string } }, name: string) {
  const haystacks = [
    connection.connector_name,
    connection.connector?.name,
    connection.connector?.display_name,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return haystacks.some((value) => value === name || value.includes(name));
}

export async function listSourceIntegrations(): Promise<SourceIntegrationStatus[]> {
  let connections: Awaited<ReturnType<ReplitConnectors["listConnections"]>> = [];

  try {
    const client = new ReplitConnectors();
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
