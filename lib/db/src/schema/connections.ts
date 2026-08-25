import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const connectionsTable = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
  (table) => [
    unique("connections_provider_unique").on(table.provider),
    index("connections_provider_idx").on(table.provider),
  ],
);

export type Connection = typeof connectionsTable.$inferSelect;
