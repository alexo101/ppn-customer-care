import { boolean, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organizationsTable, teamsTable } from "./tenancy";

export const organizationConnectionsTable = pgTable(
  "organization_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("pending"),
    metadata: jsonb("metadata").notNull().default({}),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    encryptionKeyVersion: text("encryption_key_version").notNull().default("1"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("organization_connections_org_idx").on(table.organizationId)],
);

export const teamConnectionsTable = pgTable(
  "team_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => organizationConnectionsTable.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("team_connections_team_connection_unique").on(table.teamId, table.connectionId)],
);

export type OrganizationConnection = typeof organizationConnectionsTable.$inferSelect;
export type TeamConnection = typeof teamConnectionsTable.$inferSelect;
