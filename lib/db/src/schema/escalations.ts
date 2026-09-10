import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { conversationsTable } from "./conversations";
import { workspaceMembersTable } from "./members";

export const agentEscalationSettingsTable = pgTable(
  "agent_escalation_settings",
  {
    agentId: uuid("agent_id")
      .primaryKey()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Escalation team"),
    notifyAssignedMembers: boolean("notify_assigned_members")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const agentEscalationMembersTable = pgTable(
  "agent_escalation_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => workspaceMembersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("agent_escalation_members_agent_member_unique").on(
      table.agentId,
      table.memberId,
    ),
  ],
);

export const escalationsTable = pgTable("escalations", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .unique()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("none"),
  assigneeMemberId: uuid("assignee_member_id").references(
    () => workspaceMembersTable.id,
    { onDelete: "set null" },
  ),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  reason: text("reason").notNull().default(""),
  category: text("category").notNull().default(""),
  subcategory: text("subcategory").notNull().default(""),
  retrievedInformation: jsonb("retrieved_information").notNull().default([]),
  previousAnswer: text("previous_answer").notNull().default(""),
  context: jsonb("context").notNull().default({}),
  aiSummary: text("ai_summary"),
  aiSummaryGeneratedAt: timestamp("ai_summary_generated_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const escalationAssignmentsTable = pgTable(
  "escalation_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escalationId: uuid("escalation_id")
      .notNull()
      .references(() => escalationsTable.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => workspaceMembersTable.id, { onDelete: "cascade" }),
    isRead: boolean("is_read").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("escalation_assignments_escalation_member_unique").on(
      table.escalationId,
      table.memberId,
    ),
  ],
);

export type AgentEscalationSettings =
  typeof agentEscalationSettingsTable.$inferSelect;
export type AgentEscalationMember =
  typeof agentEscalationMembersTable.$inferSelect;
export type Escalation = typeof escalationsTable.$inferSelect;
export type EscalationAssignment =
  typeof escalationAssignmentsTable.$inferSelect;
