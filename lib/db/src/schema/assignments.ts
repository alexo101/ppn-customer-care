import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { connectionsTable } from "./connections";
import { agentsTable } from "./agents";
import { knowledgeSourcesTable, apiConnectorsTable } from "./sources";

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
    connectionId: uuid("connection_id").notNull().references(() => connectionsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("agent_connection_assignments_unique").on(table.agentId, table.connectionId)],
);
