import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentConversationSettingsTable = pgTable(
  "agent_conversation_settings",
  {
    agentId: uuid("agent_id")
      .primaryKey()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    warningAfterMinutes: integer("warning_after_minutes").notNull().default(0),
    warningMessage: text("warning_message").notNull().default(""),
    autoCloseAfterMinutes: integer("auto_close_after_minutes").notNull().default(60),
    autoCloseMessage: text("auto_close_message").notNull().default(""),
    welcomeMessage: text("welcome_message")
      .notNull()
      .default(
        "Hello {user_name}, you are speaking {agent_name} Ai Agent. How can I help you?",
      ),
    escalationMessage: text("escalation_message")
      .notNull()
      .default(
        "Sorry {user_name}, I'm not able to answer this message. I can escalate this question, or you can ask another question.",
      ),
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
