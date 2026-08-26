export function buildInviteUrl(token: string, origin: string, baseUrl: string): string {
  return `${origin}${baseUrl.replace(/\/$/, "")}/invite/${token}`;
}
