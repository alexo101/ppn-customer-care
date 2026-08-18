import {
  Database,
  MessageSquare,
  Palette,
  Shield,
  Tag,
} from "lucide-react";

export const AGENT_CONFIG_STEPS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "categories", label: "Categories", icon: Tag },
  { id: "sources", label: "Sources", icon: Database },
  { id: "rules", label: "Rules", icon: Shield },
  { id: "training", label: "Training", icon: MessageSquare },
] as const;

export type AgentConfigStepId = (typeof AGENT_CONFIG_STEPS)[number]["id"];

export type AgentConfigLocation = {
  agentId: string;
  step: AgentConfigStepId;
};

export function parseAgentConfigLocation(location: string): AgentConfigLocation | null {
  const match = location.match(/^\/agents\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match) return null;

  const agentId = match[1];
  if (agentId === "new") return null;

  const section = match[2] === "conversations" ? "training" : match[2];
  if (section === "chat") return null;

  const step = AGENT_CONFIG_STEPS.find((item) => item.id === section)?.id ?? "appearance";
  return { agentId, step };
}

export function agentConfigHref(agentId: string, step: AgentConfigStepId = "appearance") {
  return `/agents/${agentId}/${step}`;
}

export function isAgentConfigStep(value: string | undefined): value is AgentConfigStepId {
  return AGENT_CONFIG_STEPS.some((item) => item.id === value);
}
