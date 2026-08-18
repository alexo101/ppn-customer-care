import { lookup } from "node:dns/promises";
import net from "node:net";
import { load, type CheerioAPI } from "cheerio";

export const DEFAULT_CTA_COLOR = "#0EA5E9";
export const DEFAULT_BACKGROUND_COLOR = "#F8FAFC";

export type ImportedWebsiteStyle = {
  websiteUrl: string;
  pageTitle: string | null;
  ctaColor: string;
  backgroundColor: string;
  logoUrl: string | null;
  ctaColorCandidates: string[];
  backgroundColorCandidates: string[];
  logoCandidates: string[];
};

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_CSS_BYTES = 400_000;
const MAX_STYLESHEETS = 8;
const MAX_REDIRECTS = 4;
const USER_AGENT =
  "Mozilla/5.0 (compatible; SupportOrchestratorAppearance/1.0; +https://localhost) AppleWebKit/537.36";

const NAMED_COLORS: Record<string, string> = {
  white: "#FFFFFF",
  black: "#000000",
  red: "#FF0000",
  blue: "#0000FF",
  navy: "#000080",
  teal: "#008080",
  aqua: "#00FFFF",
  cyan: "#00FFFF",
  orange: "#FFA500",
  coral: "#FF7F50",
  tomato: "#FF6347",
  crimson: "#DC143C",
  gold: "#FFD700",
  purple: "#800080",
  indigo: "#4B0082",
  violet: "#EE82EE",
  green: "#008000",
  lime: "#00FF00",
  olive: "#808000",
  maroon: "#800000",
  fuchsia: "#FF00FF",
  magenta: "#FF00FF",
  yellow: "#FFFF00",
  pink: "#FFC0CB",
  hotpink: "#FF69B4",
  deepskyblue: "#00BFFF",
  dodgerblue: "#1E90FF",
  royalblue: "#4169E1",
  steelblue: "#4682B4",
  slateblue: "#6A5ACD",
  mediumblue: "#0000CD",
  darkblue: "#00008B",
  darkorange: "#FF8C00",
  orangered: "#FF4500",
  mediumseagreen: "#3CB371",
  seagreen: "#2E8B57",
  forestgreen: "#228B22",
};

export async function importWebsiteStyles(rawUrl: string): Promise<ImportedWebsiteStyle> {
  const startUrl = normalizeHttpUrl(rawUrl);
  const htmlResponse = await safeFetch(startUrl);
  const finalUrl = htmlResponse.url || startUrl;
  const html = await readLimitedText(htmlResponse, MAX_HTML_BYTES);
  const $ = load(html);

  const cssTexts = await collectStylesheets($, finalUrl);
  const cssVars = extractCssVariables([...extractStyleTagCss($), ...cssTexts].join("\n"));

  const ctaScored = detectCtaColors($, cssTexts, cssVars);
  const backgroundScored = detectBackgroundColors($, cssTexts, cssVars);
  const logos = detectLogos($, finalUrl);

  const ctaColorCandidates = uniqueHexes(ctaScored.map((c) => c.hex)).slice(0, 8);
  const backgroundColorCandidates = uniqueHexes(backgroundScored.map((c) => c.hex)).slice(0, 6);

  return {
    websiteUrl: finalUrl,
    pageTitle: $("title").first().text().trim() || null,
    ctaColor: ctaColorCandidates[0] ?? DEFAULT_CTA_COLOR,
    backgroundColor: backgroundColorCandidates[0] ?? DEFAULT_BACKGROUND_COLOR,
    logoUrl: logos[0] ?? null,
    ctaColorCandidates,
    backgroundColorCandidates,
    logoCandidates: logos.slice(0, 6),
  };
}

export function normalizeHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ImportError("Enter a website URL to import styling.");
  }
  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new ImportError("That does not look like a valid website URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ImportError("Only http and https website URLs can be imported.");
  }
  if (parsed.username || parsed.password) {
    throw new ImportError("URLs with credentials cannot be imported.");
  }
  return parsed.toString();
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

async function safeFetch(url: string, remainingRedirects = MAX_REDIRECTS): Promise<Response> {
  const parsed = new URL(url);
  await assertPublicHttpUrl(parsed);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(parsed, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "text/html,text/css,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ImportError("The website took too long to respond.");
    }
    throw new ImportError("Could not reach that website. Check the URL and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location || remainingRedirects <= 0) {
      throw new ImportError("The website redirected too many times.");
    }
    return safeFetch(new URL(location, parsed).toString(), remainingRedirects - 1);
  }

  if (!response.ok) {
    throw new ImportError(`The website returned HTTP ${response.status}.`);
  }

  return response;
}

async function assertPublicHttpUrl(parsed: URL): Promise<void> {
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ImportError("Only http and https website URLs can be imported.");
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
    throw new ImportError("That URL cannot be imported.");
  }

  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new ImportError("That URL cannot be imported.");
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.some((entry) => isPrivateIp(entry.address))) {
      throw new ImportError("That URL cannot be imported.");
    }
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError("Could not resolve that website hostname.");
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

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) {
      throw new ImportError("The website response was too large to import.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ImportError("The website response was too large to import.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function extractStyleTagCss($: CheerioAPI): string[] {
  return $("style")
    .toArray()
    .map((el) => $(el).text())
    .filter(Boolean);
}

async function collectStylesheets($: CheerioAPI, pageUrl: string): Promise<string[]> {
  const hrefs = $("link[rel='stylesheet']")
    .toArray()
    .map((el) => $(el).attr("href"))
    .filter((href): href is string => Boolean(href))
    .slice(0, MAX_STYLESHEETS);

  const results: string[] = [];
  for (const href of hrefs) {
    try {
      const cssUrl = new URL(href, pageUrl).toString();
      const response = await safeFetch(cssUrl);
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !/css|text\/plain|application\/octet-stream/i.test(contentType)) {
        continue;
      }
      results.push(await readLimitedText(response, MAX_CSS_BYTES));
    } catch {
      // Skip stylesheets that cannot be fetched; HTML + inline CSS still work.
    }
  }
  return results;
}

type CssVars = Record<string, string>;

function extractCssVariables(css: string): CssVars {
  const vars: CssVars = {};
  const re = /--([a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    vars[`--${match[1]}`] = match[2].trim();
  }
  return vars;
}

function resolveCssValue(raw: string, vars: CssVars, depth = 0): string {
  if (depth > 6) return raw;
  const trimmed = raw.trim();
  const varMatch = trimmed.match(/^var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*(.+))?\)$/i);
  if (!varMatch) return trimmed;
  const resolved = vars[varMatch[1]];
  if (resolved) return resolveCssValue(resolved, vars, depth + 1);
  if (varMatch[2]) return resolveCssValue(varMatch[2], vars, depth + 1);
  return trimmed;
}

type ScoredColor = { hex: string; score: number };

function detectCtaColors($: CheerioAPI, cssTexts: string[], vars: CssVars): ScoredColor[] {
  const scored: ScoredColor[] = [];

  const metaTheme = $('meta[name="theme-color"]').attr("content");
  addColor(scored, toHex(metaTheme, vars), 4);

  const brandVarNames = [
    "--primary",
    "--color-primary",
    "--accent",
    "--color-accent",
    "--brand",
    "--brand-color",
    "--cta",
    "--cta-color",
    "--button-bg",
    "--button-background",
    "--color-button",
    "--tw-color-primary",
  ];
  for (const name of brandVarNames) {
    addColor(scored, toHex(vars[name], vars), 8);
  }

  $("a, button, input[type='submit']").each((_, el) => {
    const node = $(el);
    const blob = `${node.attr("class") ?? ""} ${node.attr("id") ?? ""} ${node.text()}`.toLowerCase();
    let score = 1;
    if (blob.includes("cta")) score += 10;
    if (blob.includes("get-started") || blob.includes("getstarted") || blob.includes("get started")) score += 8;
    if (blob.includes("sign-up") || blob.includes("signup") || blob.includes("sign up")) score += 6;
    if (blob.includes("btn-primary") || blob.includes("button-primary")) score += 9;
    if (blob.includes("primary")) score += 5;
    if (blob.includes("accent") || blob.includes("brand")) score += 4;
    if (blob.includes("btn") || blob.includes("button")) score += 3;
    if (String(node.prop("tagName") ?? "").toLowerCase() === "button" || node.attr("type") === "submit") {
      score += 2;
    }
    if (score < 4) return;

    const inline = node.attr("style") ?? "";
    addColor(scored, colorFromDeclaration(inline, "background-color", vars), score + 3);
    addColor(scored, colorFromDeclaration(inline, "background", vars), score + 2);

    const bgAttr = node.attr("bgcolor");
    addColor(scored, toHex(bgAttr, vars), score);
  });

  const css = cssTexts.join("\n");
  const ruleRe = /([^{}]+)\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(css))) {
    const selector = match[1].toLowerCase();
    const body = match[2];
    if (!/(button|\.btn|\.cta|primary|accent|brand)/i.test(selector)) continue;
    let score = 3;
    if (selector.includes("cta")) score += 8;
    if (selector.includes("btn-primary") || selector.includes("button-primary")) score += 8;
    if (selector.includes("primary")) score += 5;
    if (/\bbutton\b/.test(selector) || selector.includes(".btn")) score += 3;
    addColor(scored, colorFromDeclaration(body, "background-color", vars), score);
    addColor(scored, colorFromDeclaration(body, "background", vars), score - 1);
  }

  return scored
    .filter((c) => isLikelyCta(c.hex))
    .sort((a, b) => b.score - a.score);
}

function detectBackgroundColors($: CheerioAPI, cssTexts: string[], vars: CssVars): ScoredColor[] {
  const scored: ScoredColor[] = [];

  addColor(scored, toHex(vars["--background"], vars), 9);
  addColor(scored, toHex(vars["--color-background"], vars), 8);
  addColor(scored, toHex(vars["--bg"], vars), 6);
  addColor(scored, toHex(vars["--page-background"], vars), 6);
  addColor(scored, toHex(vars["--body-background"], vars), 6);

  const bodyStyle = $("body").attr("style") ?? "";
  addColor(scored, colorFromDeclaration(bodyStyle, "background-color", vars), 10);
  addColor(scored, colorFromDeclaration(bodyStyle, "background", vars), 8);
  addColor(scored, toHex($("body").attr("bgcolor"), vars), 7);

  const htmlStyle = $("html").attr("style") ?? "";
  addColor(scored, colorFromDeclaration(htmlStyle, "background-color", vars), 6);

  const css = cssTexts.join("\n");
  const ruleRe = /([^{}]+)\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(css))) {
    const selector = match[1].trim().toLowerCase();
    const firstSel = selector.split(",")[0]?.trim() ?? "";
    if (!/^(html|body|:root|#root|#__next|#app|html\s+body)(\s|$|:|\.|#)/.test(firstSel) && firstSel !== ":root") {
      continue;
    }
    addColor(scored, colorFromDeclaration(match[2], "background-color", vars), 8);
    addColor(scored, colorFromDeclaration(match[2], "background", vars), 6);
  }

  return scored
    .filter((c) => isLikelyBackground(c.hex))
    .sort((a, b) => b.score - a.score);
}

function detectLogos($: CheerioAPI, pageUrl: string): string[] {
  const found: { href: string; score: number }[] = [];
  const brand = brandFromUrl(pageUrl);

  const push = (raw: string | undefined, score: number) => {
    if (!raw) return;
    const abs = absolutize(raw, pageUrl);
    if (!abs) return;
    if (/hero_|promo_|accordion|_large\.|_xlarge\.|_medium\./i.test(abs)) {
      score -= 20;
    }
    found.push({ href: abs, score });
  };

  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const data = JSON.parse($(el).text()) as unknown;
      const logos = collectJsonLdLogos(data);
      for (const logo of logos) {
        const lower = logo.toLowerCase();
        if (/accordion|customer|partner|press/.test(lower)) continue;
        push(logo, /\.(jpe?g)(\?|$)/i.test(lower) ? 5 : 14);
      }
    } catch {
      // ignore invalid JSON-LD
    }
  });

  $("header img, nav img, .navbar img, img").each((_, el) => {
    const node = $(el);
    const src = node.attr("src") || node.attr("data-src") || node.attr("data-lazy-src");
    if (!src) return;
    const ownBlob = `${node.attr("class") ?? ""} ${node.attr("alt") ?? ""} ${node.attr("id") ?? ""}`.toLowerCase();
    const parentBlob = `${node.parent().attr("class") ?? ""} ${node.parent().attr("id") ?? ""}`.toLowerCase();
    const context = `${ownBlob} ${parentBlob}`;
    const srcLower = src.toLowerCase();
    const srcPath = safePathname(src, pageUrl);
    const inHeader = node.parents("header, nav").length > 0;
    const isGallery = /logos|logo-wall|logo-grid|logo-cloud|customers|partners|press|accordion|marquee/.test(
      `${context} ${srcLower}`,
    );

    if (isGallery) return;

    const mentionsBrand = Boolean(brand && (ownBlob.includes(brand) || srcPath.includes(brand)));
    const looksLikeOwnLogo =
      /\b(logo|navbar-brand|site-logo|brand-logo)\b/.test(ownBlob) ||
      /(?:^|\/)logo(?:[-_]?(?:icon|mark|lockup))?(?:\.(?:svg|png|webp|gif)|$)/i.test(srcPath) ||
      (inHeader && mentionsBrand && /\.(svg|png)(\?|$)/i.test(srcLower));

    if (!looksLikeOwnLogo) return;

    let score = 8;
    if (mentionsBrand) score += 6;
    if (/\b(logo|navbar-brand|site-logo)\b/.test(ownBlob)) score += 4;
    if (/\.svg(\?|$)/i.test(srcLower)) score += 3;
    if (inHeader) score += 2;
    if (/\.(jpe?g)(\?|$)/i.test(srcLower)) score -= 2;

    push(src, score);
    const srcset = node.attr("srcset");
    if (srcset) {
      const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
      push(first, score - 1);
    }
  });

  push($('meta[property="og:logo"]').attr("content"), 9);
  push($('link[rel="icon"][type="image/svg+xml"]').attr("href"), 12);
  push($('link[rel="apple-touch-icon"]').attr("href"), 10);
  push($('link[rel="mask-icon"]').attr("href"), 8);
  push($('link[rel="apple-touch-icon-precomposed"]').attr("href"), 7);
  push($('link[rel="icon"][type="image/png"]').attr("href"), 6);
  push($('link[rel="shortcut icon"]').attr("href"), 4);
  push($('link[rel="icon"]').attr("href"), 4);
  push($('meta[property="og:image"]').attr("content"), 2);

  return uniqueStrings(
    found
      .filter((item) => item.score >= 4)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.href)
      .filter((href) => !href.startsWith("data:image/svg+xml") || href.length < 20_000),
  );
}

function brandFromUrl(pageUrl: string): string {
  try {
    const host = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    if (parts.length >= 2 && parts[0] === "www") parts.shift();
    return parts[0] ?? "";
  } catch {
    return "";
  }
}

function safePathname(src: string, pageUrl: string): string {
  try {
    return new URL(src, pageUrl).pathname.toLowerCase();
  } catch {
    return src.toLowerCase();
  }
}

function collectJsonLdLogos(data: unknown): string[] {
  if (!data) return [];
  if (Array.isArray(data)) return data.flatMap(collectJsonLdLogos);
  if (typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const logos: string[] = [];
  if (typeof record.logo === "string") logos.push(record.logo);
  if (record.logo && typeof record.logo === "object") {
    const logoObj = record.logo as Record<string, unknown>;
    if (typeof logoObj.url === "string") logos.push(logoObj.url);
  }
  if (record.organization) logos.push(...collectJsonLdLogos(record.organization));
  if (Array.isArray(record["@graph"])) logos.push(...collectJsonLdLogos(record["@graph"]));
  return logos;
}

function addColor(scored: ScoredColor[], hex: string | null, score: number): void {
  if (!hex || score <= 0) return;
  scored.push({ hex, score });
}

function colorFromDeclaration(cssBlob: string, property: string, vars: CssVars): string | null {
  const re = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;}]+)`, "i");
  const match = cssBlob.match(re);
  if (!match) return null;
  const value = match[1].trim();
  if (property === "background" && /url\(/i.test(value) && !/(#|rgb|hsl|var\()/i.test(value)) {
    return null;
  }
  const first = value.split(",")[0]?.trim() ?? value;
  return toHex(first.replace(/!important/gi, "").trim(), vars);
}

function toHex(raw: string | undefined, vars: CssVars): string | null {
  if (!raw) return null;
  const resolved = resolveCssValue(raw.trim(), vars).trim();
  if (!resolved || resolved === "transparent" || resolved === "inherit" || resolved === "none") {
    return null;
  }

  const lower = resolved.toLowerCase();
  if (NAMED_COLORS[lower]) return NAMED_COLORS[lower];

  const hexMatch = resolved.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) return normalizeHex(hexMatch[0]);

  const spaceHsl = resolved.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (spaceHsl) {
    return hslToHex(Number(spaceHsl[1]), Number(spaceHsl[2]), Number(spaceHsl[3]));
  }

  const rgbMatch = resolved.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (rgbMatch) {
    const alpha = parseAlpha(rgbMatch[4]);
    if (alpha < 0.2) return null;
    return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  }

  const hslMatch = resolved.match(/^hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (hslMatch) {
    const alpha = parseAlpha(hslMatch[4]);
    if (alpha < 0.2) return null;
    return hslToHex(Number(hslMatch[1]), Number(hslMatch[2]), Number(hslMatch[3]));
  }

  return null;
}

function parseAlpha(raw: string | undefined): number {
  if (!raw) return 1;
  if (raw.endsWith("%")) return Number(raw.slice(0, -1)) / 100;
  return Number(raw);
}

function normalizeHex(hex: string): string | null {
  let value = hex.replace("#", "").toUpperCase();
  if (value.length === 3 || value.length === 4) {
    value = value
      .slice(0, 3)
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (value.length === 8) value = value.slice(0, 6);
  if (!/^[0-9A-F]{6}$/.test(value)) return null;
  return `#${value}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lig - c / 2;
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function isLikelyCta(hex: string): boolean {
  const { r, g, b, l, s } = hexStats(hex);
  if (s < 12 && l > 20 && l < 90) return false;
  if (l > 93 || l < 8) return false;
  if (r > 245 && g > 245 && b > 245) return false;
  return true;
}

function isLikelyBackground(hex: string): boolean {
  const { l } = hexStats(hex);
  return l >= 4 && l <= 98;
}

function hexStats(hex: string): { r: number; g: number; b: number; l: number; s: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = ((max + min) / 2) * 100;
  const d = max - min;
  const s = d === 0 ? 0 : (d / (1 - Math.abs((max + min) - 1))) * 100;
  return { r, g, b, l, s: Number.isFinite(s) ? s : 0 };
}

function uniqueHexes(hexes: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const hex of hexes) {
    if (seen.has(hex)) continue;
    seen.add(hex);
    result.push(hex);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function absolutize(raw: string, pageUrl: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("javascript:")) return null;
  if (trimmed.startsWith("data:")) return trimmed;
  try {
    return new URL(trimmed, pageUrl).toString();
  } catch {
    return null;
  }
}
