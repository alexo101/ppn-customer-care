import { lookup } from "node:dns/promises";
import net from "node:net";
import {
  extractOfficeText,
  OFFICE_MAX_BYTES,
  type ExtractedOfficeImage,
} from "./extract-office";

export const GOOGLE_SOURCE_UNSHARED =
  "This file is not shared. In Google, set sharing to Anyone with the link can view.";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;
const USER_AGENT = "Mozilla/5.0 (compatible; SupportOrchestratorKnowledge/1.0)";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export class GoogleSourceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "GoogleSourceError";
    this.statusCode = statusCode;
  }
}

export type ParsedKnowledgeUrl =
  | { kind: "google-document"; fileId: string; url: string }
  | { kind: "google-spreadsheet"; fileId: string; url: string }
  | { kind: "office-file"; officeKind: "document" | "spreadsheet"; url: string };

export type FetchedKnowledgeSource = {
  kind: "document" | "spreadsheet";
  title: string;
  text: string;
  url: string;
  mimeType: string;
  images: ExtractedOfficeImage[];
};

type FetchImpl = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function parseKnowledgeSourceUrl(raw: string): ParsedKnowledgeUrl {
  const parsed = parseHttpsUrl(raw);
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  if (host === "docs.google.com") {
    const docId = matchGoogleFileId(path, "document");
    if (docId) {
      return { kind: "google-document", fileId: docId, url: parsed.toString() };
    }
    const sheetId = matchGoogleFileId(path, "spreadsheets");
    if (sheetId) {
      return { kind: "google-spreadsheet", fileId: sheetId, url: parsed.toString() };
    }
    throw new GoogleSourceError(
      "Paste a Google Doc or Google Sheet link, or a public .docx or .xlsx URL.",
    );
  }

  const officeKind = officeKindFromPath(path);
  if (officeKind) {
    return { kind: "office-file", officeKind, url: parsed.toString() };
  }

  throw new GoogleSourceError(
    "Paste a Google Doc or Google Sheet link, or a public .docx or .xlsx URL.",
  );
}

export function googleExportUrl(parsed: ParsedKnowledgeUrl): string {
  if (parsed.kind === "google-document") {
    return `https://docs.google.com/document/d/${parsed.fileId}/export?format=docx`;
  }
  if (parsed.kind === "google-spreadsheet") {
    return `https://docs.google.com/spreadsheets/d/${parsed.fileId}/export?format=xlsx`;
  }
  return parsed.url;
}

export async function fetchKnowledgeSourceFromUrl(
  raw: string,
  deps: { fetch?: FetchImpl } = {},
): Promise<FetchedKnowledgeSource> {
  const parsed = parseKnowledgeSourceUrl(raw);
  const fetchImpl = deps.fetch ?? fetch;

  if (parsed.kind === "office-file") {
    const response = await fetchAllowlisted(parsed.url, fetchImpl, {
      allowGoogleRedirects: false,
    });
    const buffer = await readLimitedBuffer(response);
    const extracted = await extractOfficeText({
      originalname: fileNameFromUrl(parsed.url, parsed.officeKind === "spreadsheet" ? "file.xlsx" : "file.docx"),
      mimetype: parsed.officeKind === "spreadsheet" ? XLSX_MIME : DOCX_MIME,
      buffer,
    });
    if (!extracted.text) {
      throw new GoogleSourceError("That document had no readable text.");
    }
    return {
      kind: extracted.kind,
      title: fileNameFromUrl(parsed.url, extracted.kind === "spreadsheet" ? "Spreadsheet" : "Document"),
      text: extracted.text,
      images: extracted.images,
      url: parsed.url,
      mimeType: extracted.kind === "spreadsheet" ? XLSX_MIME : DOCX_MIME,
    };
  }

  const exportUrl = googleExportUrl(parsed);
  const response = await fetchAllowlisted(exportUrl, fetchImpl, { allowGoogleRedirects: true });
  const buffer = await readLimitedBuffer(response);
  assertNotGoogleSignInPage(response, buffer);

  if (parsed.kind === "google-document") {
    let extracted: Awaited<ReturnType<typeof extractOfficeText>>;
    try {
      extracted = await extractOfficeText({
        originalname: "document.docx",
        mimetype: DOCX_MIME,
        buffer,
      });
    } catch (error) {
      // Keep compatibility with older Google export responses and test doubles
      // that return text/plain while new exports return a DOCX archive.
      if ((response.headers.get("content-type") ?? "").includes("text/plain")) {
        const text = buffer.toString("utf8").trim();
        if (!text) throw new GoogleSourceError("That document had no readable text.");
        extracted = { kind: "document", text, images: [] };
      } else {
        throw error;
      }
    }
    if (!extracted.text && extracted.images.length === 0) {
      throw new GoogleSourceError("That document had no readable text.");
    }
    const title =
      filenameFromContentDisposition(response.headers.get("content-disposition")) ?? "Google Doc";
    return {
      kind: "document",
      title: title.replace(/\.(txt|docx)$/i, "") || "Google Doc",
      text: extracted.text,
      url: parsed.url,
      mimeType: DOCX_MIME,
      images: extracted.images,
    };
  }

  const extracted = await extractOfficeText({
    originalname: "sheet.xlsx",
    mimetype: XLSX_MIME,
    buffer,
  });
  if (!extracted.text) {
    throw new GoogleSourceError("That spreadsheet had no readable text.");
  }
  const title =
    filenameFromContentDisposition(response.headers.get("content-disposition")) ?? "Google Sheet";
  return {
    kind: "spreadsheet",
    title: title.replace(/\.(xlsx|csv)$/i, "") || "Google Sheet",
    text: extracted.text,
    images: extracted.images,
    url: parsed.url,
    mimeType: XLSX_MIME,
  };
}

function parseHttpsUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new GoogleSourceError("Paste a Google Doc or Google Sheet link.");
  }
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new GoogleSourceError("Paste a valid https link.");
  }
  if (parsed.protocol !== "https:") {
    throw new GoogleSourceError("Only https links can be imported.");
  }
  return parsed;
}

function matchGoogleFileId(pathname: string, kind: "document" | "spreadsheets"): string | null {
  const pattern =
    kind === "document"
      ? /\/document(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/i
      : /\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/i;
  const match = pathname.match(pattern);
  return match?.[1] ?? null;
}

function officeKindFromPath(pathname: string): "document" | "spreadsheet" | null {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".docx")) return "document";
  if (lower.endsWith(".xlsx")) return "spreadsheet";
  return null;
}

function isGoogleExportHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "docs.google.com" || host === "drive.google.com") return true;
  if (host === "drive.usercontent.google.com") return true;
  return host.endsWith(".googleusercontent.com");
}

function isGoogleSignInHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "accounts.google.com" || host.endsWith(".accounts.google.com");
}

async function fetchAllowlisted(
  url: string,
  fetchImpl: FetchImpl,
  options: { allowGoogleRedirects: boolean },
  remainingRedirects = MAX_REDIRECTS,
): Promise<Response> {
  const parsed = new URL(url);
  if (options.allowGoogleRedirects) {
    if (parsed.protocol !== "https:") {
      throw new GoogleSourceError("Only https links can be imported.");
    }
    if (isGoogleSignInHost(parsed.hostname)) {
      throw new GoogleSourceError(GOOGLE_SOURCE_UNSHARED);
    }
    if (!isGoogleExportHost(parsed.hostname)) {
      throw new GoogleSourceError(GOOGLE_SOURCE_UNSHARED);
    }
  } else {
    await assertPublicHttpUrl(parsed);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(parsed, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "*/*",
        "User-Agent": USER_AGENT,
      },
    });
  } catch (err) {
    if (err instanceof GoogleSourceError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new GoogleSourceError("That link took too long to respond.");
    }
    throw new GoogleSourceError("Could not reach that link. Check the URL and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location || remainingRedirects <= 0) {
      throw new GoogleSourceError("That link redirected too many times.");
    }
    const next = new URL(location, parsed);
    if (options.allowGoogleRedirects) {
      if (isGoogleSignInHost(next.hostname)) {
        throw new GoogleSourceError(GOOGLE_SOURCE_UNSHARED);
      }
    }
    return fetchAllowlisted(next.toString(), fetchImpl, options, remainingRedirects - 1);
  }

  if (response.status === 401 || response.status === 403) {
    throw new GoogleSourceError(GOOGLE_SOURCE_UNSHARED);
  }
  if (!response.ok) {
    throw new GoogleSourceError("Could not download that file. Check the link and try again.");
  }

  return response;
}

async function readLimitedBuffer(response: Response): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > OFFICE_MAX_BYTES) {
      throw new GoogleSourceError("That file is larger than 10 MB.");
    }
    return bytes;
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.byteLength;
    if (total > OFFICE_MAX_BYTES) {
      throw new GoogleSourceError("That file is larger than 10 MB.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function assertNotGoogleSignInPage(response: Response, buffer: Buffer): void {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const preview = buffer.subarray(0, 2048).toString("utf8");
  const looksHtml =
    contentType.includes("text/html") ||
    /^\s*<(!doctype html|html)/i.test(preview);
  if (!looksHtml) return;
  if (
    /accounts\.google\.com/i.test(preview) ||
    /ServiceLogin/i.test(preview) ||
    /sign in to continue/i.test(preview) ||
    />Sign in</i.test(preview)
  ) {
    throw new GoogleSourceError(GOOGLE_SOURCE_UNSHARED);
  }
  throw new GoogleSourceError(GOOGLE_SOURCE_UNSHARED);
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1]).replace(/["']/g, "").trim();
    } catch {
      return utf[1].trim();
    }
  }
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1].trim();
  const plain = header.match(/filename=([^;]+)/i);
  return plain?.[1]?.replace(/["']/g, "").trim() || null;
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").filter(Boolean).at(-1);
    return last ? decodeURIComponent(last) : fallback;
  } catch {
    return fallback;
  }
}

async function assertPublicHttpUrl(parsed: URL): Promise<void> {
  if (parsed.protocol !== "https:") {
    throw new GoogleSourceError("Only https links can be imported.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".arpa") ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  ) {
    throw new GoogleSourceError("That URL cannot be imported.");
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new GoogleSourceError("That URL cannot be imported.");
  }
  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.some((entry) => isPrivateIp(entry.address))) {
      throw new GoogleSourceError("That URL cannot be imported.");
    }
  } catch (err) {
    if (err instanceof GoogleSourceError) throw err;
    throw new GoogleSourceError("Could not resolve that hostname.");
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIP(ip) === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80")) return true;
    if (normalized.startsWith("::ffff:")) {
      return isPrivateIp(normalized.slice(7));
    }
    return false;
  }
  return true;
}
