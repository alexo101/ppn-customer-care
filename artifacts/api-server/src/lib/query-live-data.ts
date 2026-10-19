import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, request, type AgentOptions } from "node:https";

export type QueryLiveDataSettings = {
  endpointUrl: string;
};

export type LiveClientFacts = Record<string, string | number | boolean>;

export type LiveClientCandidate = {
  name: string;
  facts: LiveClientFacts;
};

export type LiveClientLookupResult =
  | { status: "matched"; client: LiveClientCandidate }
  | { status: "ambiguous"; candidates: LiveClientCandidate[] }
  | { status: "not_found" }
  | { status: "unauthorized" }
  | { status: "unavailable" };

export type LiveLookupCaller = {
  userId: string;
  agentId: string;
};

export type LiveClientHistoryMessage = {
  sender: string;
  content: string;
  metadata?: unknown;
};

export type LiveClientIntent =
  | { kind: "lookup"; clientName: string; continuation: boolean }
  | { kind: "ask_name" }
  | { kind: "none" };

const CLIENT_NAME_PLACEHOLDER = "{clientName}";
const LIVE_QUERY_SECRET_NAME = "LIVE_QUERY_CLIENT_API_TOKEN";
const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_FACT_FIELDS = 24;
const REQUEST_TIMEOUT_MS = 4500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitWindows = new Map<string, { startedAt: number; count: number }>();

export const EMPTY_QUERY_LIVE_DATA_SETTINGS: QueryLiveDataSettings = {
  endpointUrl: "",
};

export function readQueryLiveDataSettings(value: unknown): QueryLiveDataSettings {
  if (!isRecord(value) || !isRecord(value.queryLiveData)) {
    return { ...EMPTY_QUERY_LIVE_DATA_SETTINGS };
  }
  const config = value.queryLiveData;
  const settings: QueryLiveDataSettings = {
    endpointUrl: typeof config.endpointUrl === "string" ? config.endpointUrl : "",
  };
  return validateQueryLiveDataSettings(settings) === null
    ? settings
    : { ...EMPTY_QUERY_LIVE_DATA_SETTINGS };
}

export function validateQueryLiveDataSettings(
  settings: QueryLiveDataSettings,
): string | null {
  if (!settings.endpointUrl.trim()) return null;
  if (settings.endpointUrl.length > 2048) {
    return "The endpoint URL must be 2,048 characters or fewer.";
  }

  const template = settings.endpointUrl.trim();
  if (template.split(CLIENT_NAME_PLACEHOLDER).length !== 2) {
    return "Include {clientName} exactly once in the URL path or query string.";
  }
  const authority = template.match(/^https:\/\/([^/?#]+)/i)?.[1];
  if (!authority || template.slice(0, template.indexOf(CLIENT_NAME_PLACEHOLDER)).includes(authority) === false) {
    return "Use a complete HTTPS URL and put {clientName} in its path or query string.";
  }
  let parsed: URL;
  try {
    parsed = new URL(template.replace(CLIENT_NAME_PLACEHOLDER, "client-name-check"));
  } catch {
    return "Enter a valid HTTPS endpoint URL.";
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    isUnsafeAddress(parsed.hostname)
  ) {
    return "Use a public HTTPS endpoint without embedded credentials or a fragment.";
  }
  if ([...parsed.searchParams.keys()].some((key) => /token|secret|password|api.?key|auth/i.test(key))) {
    return "Do not put credentials in the URL; use the Replit secret field.";
  }
  return null;
}

export function hasQueryLiveDataSettings(value: unknown): boolean {
  return Boolean(readQueryLiveDataSettings(value).endpointUrl);
}

export function detectLiveClientIntent(
  message: string,
  history: LiveClientHistoryMessage[],
): LiveClientIntent {
  const clientName = extractClientName(message);
  const asksForClientData = hasClientDataIntent(message);

  if (clientName && asksForClientData) {
    return { kind: "lookup", clientName, continuation: false };
  }

  const prior = getMostRecentLiveLookup(history);
  if (prior?.status === "awaiting_name") {
    const suppliedName = extractBareClientName(message);
    if (suppliedName) {
      return {
        kind: "lookup",
        clientName: suppliedName,
        continuation: true,
      };
    }
  }
  if (
    prior?.status === "matched" &&
    asksForClientData &&
    isClientDataFollowUp(message)
  ) {
    return {
      kind: "lookup",
      clientName: prior.clientName,
      continuation: true,
    };
  }
  if (
    asksForSpecificClientFact(message) &&
    mentionsClientWithoutName(message) &&
    !isHowToQuestion(message)
  ) {
    return { kind: "ask_name" };
  }
  return { kind: "none" };
}

export async function lookupLiveClient(
  settings: QueryLiveDataSettings,
  caller: LiveLookupCaller,
  clientName: string,
  transport: LiveDataTransport = requestJsonOverHttps,
): Promise<LiveClientLookupResult> {
  const invalidSettings = validateQueryLiveDataSettings(settings);
  if (invalidSettings || !settings.endpointUrl.trim()) {
    return { status: "unavailable" };
  }
  const secret = process.env[LIVE_QUERY_SECRET_NAME];
  if (!secret) return { status: "unavailable" };
  if (!consumeRateLimit(`${caller.agentId}:${caller.userId}`)) {
    return { status: "unavailable" };
  }

  let target: URL;
  try {
    target = new URL(
      settings.endpointUrl
        .trim()
        .replace(CLIENT_NAME_PLACEHOLDER, encodeURIComponent(clientName)),
    );
  } catch {
    return { status: "unavailable" };
  }
  if (target.protocol !== "https:" || isUnsafeAddress(target.hostname)) {
    return { status: "unavailable" };
  }

  try {
    const response = await transport(target, {
      authorization: `Bearer ${secret}`,
      accept: "application/json",
      "x-orchestrator-caller-id": caller.userId,
      "x-orchestrator-agent-id": caller.agentId,
    });
    if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.contentType)) {
      return { status: "unavailable" };
    }
    const parsed: unknown = JSON.parse(response.body);
    if (!isRecord(parsed) || parsed.authorized !== true) {
      return { status: "unauthorized" };
    }
    if (parsed.authorizedForUserId !== caller.userId || !Array.isArray(parsed.clients)) {
      return { status: "unauthorized" };
    }

    const clients = parsed.clients
      .filter(isRecord)
      .filter((record) => record.authorized === true)
      .map(toCandidate)
      .filter((candidate): candidate is LiveClientCandidate => candidate !== null);

    if (clients.length === 0) return { status: "not_found" };
    if (clients.length === 1) {
      return clients[0].facts && Object.keys(clients[0].facts).length
        ? { status: "matched", client: clients[0] }
        : { status: "unavailable" };
    }
    return {
      status: "ambiguous",
      candidates: clients.slice(0, 3),
    };
  } catch {
    return { status: "unavailable" };
  }
}

function extractClientName(message: string): string | null {
  const direct = message.match(
    /\b(?:my\s+|mi\s+|the\s+|el\s+|la\s+)?(?:client|cliente|customer)\s*(?:name\s*)?[:,#-]?\s+([\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|de|del|la|los|van|von)){0,2})/u,
  );
  const afterPreposition = message.match(
    /\b(?:a|de|del|para|about|for|of|to)\s+([\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|de|del|la|los|van|von)){0,2})/u,
  );
  const candidate = direct?.[1] ?? afterPreposition?.[1];
  const cleaned = candidate?.replace(/[.,?!;:]+$/g, "").trim();
  return cleaned && cleaned.length <= 100 ? cleaned : null;
}

function extractBareClientName(message: string): string | null {
  const name = message
    .trim()
    .replace(/^[¿¡"'“”]+|[?!.,;:"'“”]+$/g, "")
    .trim();
  if (!name || name.length > 100) return null;
  const tokens = name.split(/\s+/);
  if (tokens.length > 3) return null;
  return tokens.every((token) =>
    /^[\p{Lu}][\p{L}\p{M}'’.-]*$/u.test(token),
  )
    ? name
    : null;
}

function hasClientDataIntent(message: string): boolean {
  if (/\b(?:quiero que me llamen|please call me|call me back|i want a callback)\b/i.test(message)) {
    return false;
  }
  return /(?:llam|call(?:ed|ing)?|contact|estado|status|situaci[oó]n|contrat|contract|factur|invoice|pago|paid|payment|saldo|balance|cuenta|account|pedido|order|[uú]ltim[oa]|last|fecha|date|informaci[oó]n|information|datos|details|what happened|qu[eé] pas[oó]|who is|qu[eé] es)/i.test(message);
}

function asksForSpecificClientFact(message: string): boolean {
  if (/\b(?:quiero que me llamen|please call me|call me back|i want a callback)\b/i.test(message)) {
    return false;
  }
  return /(?:llam|call(?:ed|ing)?|contact|estado|status|situaci[oó]n|contrat|contract|factur|invoice|pago|paid|payment|saldo|balance|[uú]ltim[oa]|last|fecha|date|tel[eé]fono|phone|email|direcci[oó]n|address)/i.test(message);
}

function mentionsClientWithoutName(message: string): boolean {
  return /\b(?:client|cliente|clienta|customer)\b/i.test(message);
}

function isHowToQuestion(message: string): boolean {
  return /(?:\bhow\s+(?:can|do|to|should|would)\b|\bwhere\s+(?:can|do)\b|\bc[oó]mo\s+(?:puedo|s[eé]|saber|ver|consultar|encontrar|identifico)|\bd[oó]nde\s+(?:puedo|veo|consulto))/i.test(message);
}

function isClientDataFollowUp(message: string): boolean {
  const normalized = message.trim().replace(/^[¿¡]+\s*/, "");
  return (
    !isHowToQuestion(normalized) &&
    /^(?:and\b|also\b|what about\b|how about\b|y\b|tambi[eé]n\b)|\b(?:their|them|they|his|her|that client|this client|su cliente|ese cliente|esa cliente|el cliente|la cliente)\b/i.test(
      normalized,
    )
  );
}

function getMostRecentLiveLookup(
  history: LiveClientHistoryMessage[],
):
  | { status: "matched"; clientName: string }
  | { status: "awaiting_name" }
  | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message.sender !== "assistant") continue;
    if (!isRecord(message.metadata) || !isRecord(message.metadata.liveDataLookup)) {
      return null;
    }
    const lookup = message.metadata.liveDataLookup;
    if (lookup.status === "awaiting_name") {
      return { status: "awaiting_name" };
    }
    if (
      lookup.status === "matched" &&
      typeof lookup.clientName === "string" &&
      lookup.clientName.trim()
    ) {
      return { status: "matched", clientName: lookup.clientName };
    }
    return null;
  }
  return null;
}

function toCandidate(
  record: Record<string, unknown>,
): LiveClientCandidate | null {
  const name = safeText(record.name, 120);
  const facts = readFacts(record.facts);
  return name && Object.keys(facts).length > 0 ? { name, facts } : null;
}

function readFacts(value: unknown): LiveClientFacts {
  if (!isRecord(value)) return {};
  const facts: LiveClientFacts = {};
  for (const [field, value] of Object.entries(value).slice(0, MAX_FACT_FIELDS)) {
    if (
      !FIELD_KEY_PATTERN.test(field) ||
      /(?:password|secret|token|credential|api.?key)/i.test(field)
    ) {
      continue;
    }
    const safeValue = safeFact(value);
    if (safeValue !== null) facts[field] = safeValue;
  }
  return facts;
}

function safeFact(value: unknown): string | number | boolean | null {
  if (typeof value === "string") return safeText(value, 400);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return null;
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const safe = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return safe ? safe.slice(0, maxLength) : null;
}

function consumeRateLimit(key: string, now = Date.now()): boolean {
  const current = rateLimitWindows.get(key);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitWindows.set(key, { startedAt: now, count: 1 });
    if (rateLimitWindows.size > 2000) {
      for (const [entryKey, window] of rateLimitWindows) {
        if (now - window.startedAt >= RATE_LIMIT_WINDOW_MS) {
          rateLimitWindows.delete(entryKey);
        }
      }
    }
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnsafeAddress(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  const family = isIP(host);
  if (family === 4) {
    const [a, b] = host.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (family === 6) {
    const mappedIpv4 = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
    if (mappedIpv4) return isUnsafeAddress(mappedIpv4);
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab]/.test(host) ||
      host.startsWith("ff") ||
      host.startsWith("2001:db8") ||
      host.startsWith("2002:")
    );
  }
  return false;
}

type LiveDataTransport = (
  target: URL,
  headers: Record<string, string>,
) => Promise<{ status: number; contentType: string; body: string }>;

const safeLookup: NonNullable<AgentOptions["lookup"]> = (
  hostname,
  _options,
  callback,
) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (
      !addresses.length ||
      addresses.some((entry) => isUnsafeAddress(entry.address))
    ) {
      return callback(new Error("The endpoint host did not resolve to a public address."), "", 0);
    }
    const selected = addresses[0];
    return callback(null, selected.address, selected.family);
  });
};

const requestJsonOverHttps: LiveDataTransport = (target, headers) =>
  new Promise((resolve, reject) => {
    const agent = new Agent({ lookup: safeLookup, keepAlive: false });
    const outgoing = request(
      target,
      {
        method: "GET",
        headers: { ...headers, "user-agent": "AppPro-Copilot/1.0" },
        agent,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        let size = 0;
        incoming.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            outgoing.destroy(new Error("Live data response exceeded the size limit."));
            return;
          }
          chunks.push(buffer);
        });
        incoming.on("end", () => {
          resolve({
            status: incoming.statusCode ?? 0,
            contentType: incoming.headers["content-type"] ?? "",
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        incoming.on("error", reject);
      },
    );
    outgoing.on("timeout", () => outgoing.destroy(new Error("Live data request timed out.")));
    outgoing.on("error", reject);
    outgoing.on("close", () => agent.destroy());
    outgoing.end();
  });
