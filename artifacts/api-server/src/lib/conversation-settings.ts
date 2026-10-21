import { eq } from "drizzle-orm";
import {
  agentConversationSettingsTable,
  agentsTable,
  db,
  type AgentConversationSettings,
} from "@workspace/db";
import {
  DEFAULT_CONVERSATION_SETTINGS,
  type ConversationSettingsValues,
} from "./conversation-auto-close";
import {
  hasRequiredEscalationTokens,
  hasRequiredWelcomeTokens,
} from "./welcome-message";

export {
  DEFAULT_CONVERSATION_SETTINGS,
  inactivityDurationMs,
  type ConversationSettingsValues,
} from "./conversation-auto-close";

export class ConversationSettingsError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ConversationSettingsError";
    this.statusCode = statusCode;
  }
}

export type AgentConversationSettingsDto = ConversationSettingsValues & {
  agentId: string;
};

type SettingsExecutor = Pick<typeof db, "select" | "insert">;

export function toAgentConversationSettings(
  row: AgentConversationSettings,
): AgentConversationSettingsDto {
  return {
    agentId: row.agentId,
    warningAfterMinutes: row.warningAfterMinutes,
    warningMessage: row.warningMessage,
    autoCloseAfterMinutes: row.autoCloseAfterMinutes,
    autoCloseMessage: row.autoCloseMessage,
    welcomeMessage: row.welcomeMessage,
    escalationMessage: row.escalationMessage,
  };
}

export async function ensureAgentConversationSettings(
  agentId: string,
  executor: SettingsExecutor = db,
) {
  const [existing] = await executor
    .select()
    .from(agentConversationSettingsTable)
    .where(eq(agentConversationSettingsTable.agentId, agentId))
    .limit(1);
  if (existing) return existing;

  const [created] = await executor
    .insert(agentConversationSettingsTable)
    .values({ agentId, ...DEFAULT_CONVERSATION_SETTINGS })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [retry] = await executor
    .select()
    .from(agentConversationSettingsTable)
    .where(eq(agentConversationSettingsTable.agentId, agentId))
    .limit(1);
  if (!retry) {
    throw new ConversationSettingsError(
      "Could not create conversation settings.",
      500,
    );
  }
  return retry;
}

export async function ensureAgentConversationSettingsForAllAgents() {
  const agents = await db.select({ id: agentsTable.id }).from(agentsTable);
  if (agents.length === 0) return 0;

  const existing = await db
    .select({ agentId: agentConversationSettingsTable.agentId })
    .from(agentConversationSettingsTable);
  const hasSettings = new Set(existing.map((row) => row.agentId));
  const missing = agents.filter((agent) => !hasSettings.has(agent.id));
  if (missing.length === 0) return 0;

  await db.insert(agentConversationSettingsTable).values(
    missing.map((agent) => ({
      agentId: agent.id,
      ...DEFAULT_CONVERSATION_SETTINGS,
    })),
  );
  return missing.length;
}

export async function getAgentConversationSettings(agentId: string) {
  const settings = await ensureAgentConversationSettings(agentId);
  return toAgentConversationSettings(settings);
}

export async function updateAgentConversationSettings(
  agentId: string,
  input: ConversationSettingsValues,
) {
  if (!hasRequiredWelcomeTokens(input.welcomeMessage)) {
    throw new ConversationSettingsError(
      "Welcome message must include {user_name} and {agent_name}.",
    );
  }
  if (!hasRequiredEscalationTokens(input.escalationMessage)) {
    throw new ConversationSettingsError(
      "Escalation message must include {user_name}.",
    );
  }
  await ensureAgentConversationSettings(agentId);
  const [row] = await db
    .update(agentConversationSettingsTable)
    .set({
      warningAfterMinutes: Math.trunc(input.warningAfterMinutes),
      warningMessage: input.warningMessage,
      autoCloseAfterMinutes: Math.trunc(input.autoCloseAfterMinutes),
      autoCloseMessage: input.autoCloseMessage,
      welcomeMessage: input.welcomeMessage,
      escalationMessage: input.escalationMessage,
      updatedAt: new Date(),
    })
    .where(eq(agentConversationSettingsTable.agentId, agentId))
    .returning();
  if (!row) {
    throw new ConversationSettingsError(
      "Conversation settings not found.",
      404,
    );
  }
  return toAgentConversationSettings(row);
}
