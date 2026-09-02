import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentConversationSettingsTable = pgTable(
  "agent_conversation_settings",
  {
    agentId: uuid("agent_id")
      .primaryKey()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    autoCloseDays: integer("auto_close_days").notNull().default(0),
    autoCloseHours: integer("auto_close_hours").notNull().default(1),
    autoCloseMinutes: integer("auto_close_minutes").notNull().default(0),
    closingMessage: text("closing_message").notNull().default(""),
    askIfResolved: boolean("ask_if_resolved").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export type AgentConversationSettings =
  typeof agentConversationSettingsTable.$inferSelect;
