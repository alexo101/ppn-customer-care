import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { teamsTable } from "./tenancy";
import { teamConnectionsTable } from "./connections";
import { agentsTable } from "./agents";
import { knowledgeSourcesTable, apiConnectorsTable } from "./sources";

export const teamSourceGrantsTable = pgTable(
  "team_source_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => knowledgeSourcesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("team_source_grants_team_source_unique").on(table.teamId, table.sourceId),
    index("team_source_grants_team_idx").on(table.teamId),
  ],
);

export const teamConnectorGrantsTable = pgTable(
  "team_connector_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
    connectorId: uuid("connector_id").notNull().references(() => apiConnectorsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("team_connector_grants_team_connector_unique").on(table.teamId, table.connectorId)],
);

export const agentSourceAssignmentsTable = pgTable(
  "agent_source_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => knowledgeSourcesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("agent_source_assignments_agent_source_unique").on(table.agentId, table.sourceId)],
);

export const agentConnectorAssignmentsTable = pgTable(
  "agent_connector_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
    connectorId: uuid("connector_id").notNull().references(() => apiConnectorsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("agent_connector_assignments_agent_connector_unique").on(table.agentId, table.connectorId)],
);

export const agentConnectionAssignmentsTable = pgTable(
  "agent_connection_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
    teamConnectionId: uuid("team_connection_id").notNull().references(() => teamConnectionsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("agent_connection_assignments_unique").on(table.agentId, table.teamConnectionId)],
);
