export const DEFAULT_WELCOME_MESSAGE =
  "Hello {user_name}, you are speaking {agent_name} Ai Agent. How can I help you?";
export const DEFAULT_ESCALATION_MESSAGE =
  "Sorry {user_name}, I'm not able to answer this message. I can escalate this question, or you can ask another question.";

export const WELCOME_MESSAGE_MAX = 2000;
export const ESCALATION_MESSAGE_MAX = 2000;

export const REQUIRED_WELCOME_TOKENS = ["{user_name}", "{agent_name}"] as const;
export const REQUIRED_ESCALATION_TOKENS = ["{user_name}"] as const;

export type WelcomeToken = (typeof REQUIRED_WELCOME_TOKENS)[number];

export type TemplateSegment =
  { type: "text"; value: string } | { type: "token"; value: WelcomeToken };

const TOKEN_PATTERN = /\{user_name\}|\{agent_name\}/g;

export function hasRequiredWelcomeTokens(value: string): boolean {
  return hasRequiredMessageTokens(value, REQUIRED_WELCOME_TOKENS);
}

export function hasRequiredEscalationTokens(value: string): boolean {
  return hasRequiredMessageTokens(value, REQUIRED_ESCALATION_TOKENS);
}

export function hasRequiredMessageTokens(
  value: string,
  tokens: readonly string[],
): boolean {
  return tokens.every((token) => value.includes(token));
}

export function parseWelcomeTemplate(value: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "text", value: value.slice(lastIndex, index) });
    }
    segments.push({ type: "token", value: match[0] as WelcomeToken });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) {
    segments.push({ type: "text", value: value.slice(lastIndex) });
  }
  return segments;
}
