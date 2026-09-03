export const DEFAULT_WELCOME_MESSAGE =
  "Hello {user_name}, you are speaking {agent_name} Ai Agent. How can I help you?";

export const WELCOME_MESSAGE_MAX = 2000;

export const REQUIRED_WELCOME_TOKENS = ["{user_name}", "{agent_name}"] as const;

export type WelcomeToken = (typeof REQUIRED_WELCOME_TOKENS)[number];

export type TemplateSegment =
  | { type: "text"; value: string }
  | { type: "token"; value: WelcomeToken };

const TOKEN_PATTERN = /\{user_name\}|\{agent_name\}/g;

export function hasRequiredWelcomeTokens(value: string): boolean {
  return REQUIRED_WELCOME_TOKENS.every((token) => value.includes(token));
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
