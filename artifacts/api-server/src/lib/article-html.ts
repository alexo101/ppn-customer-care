import * as cheerio from "cheerio";

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "code",
  "pre",
  "hr",
  "img",
  "span",
]);

const REMOVED_TAGS = "script,style,iframe,object,embed,form,link,meta,svg,math,noscript";
const ASSET_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SanitizedArticleHtml = {
  html: string;
  text: string;
  assetIds: string[];
};

export function sanitizeArticleHtml(input: string): SanitizedArticleHtml {
  const $ = cheerio.load(`<div id="article-root">${input ?? ""}</div>`);
  const root = $("#article-root");
  root.find(REMOVED_TAGS).remove();
  const assetIds: string[] = [];
  const nodes = root.find("*").toArray();
  for (const node of nodes) sanitizeElement($, node, assetIds);
  const html = root.html()?.trim() ?? "";
  return {
    html,
    text: articleText(html),
    assetIds: [...new Set(assetIds)],
  };
}

export function articleHasContent(sanitized: SanitizedArticleHtml): boolean {
  return sanitized.text.trim().length > 0 || sanitized.assetIds.length > 0;
}

type ArticleElement = {
  tagName?: string;
  parent?: unknown;
  attribs?: Record<string, string>;
};

function sanitizeElement(
  $: cheerio.CheerioAPI,
  node: ArticleElement,
  assetIds: string[],
): void {
  const tag = node.tagName?.toLowerCase();
  if (!tag || !node.parent) return;
  const current = $(node as never);
  if (!ALLOWED_TAGS.has(tag)) {
    current.replaceWith(current.contents());
    return;
  }

  if (tag === "a") {
    const href = (current.attr("href") ?? "").trim();
    clearAttributes($, node);
    if (!isSafeHref(href)) {
      current.replaceWith(current.contents());
      return;
    }
    current.attr("href", href);
    current.attr("rel", "noopener noreferrer");
    current.attr("target", "_blank");
    return;
  }

  if (tag === "img") {
    const assetId = (current.attr("data-asset-id") ?? "").trim();
    const alt = (current.attr("alt") ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (!ASSET_ID.test(assetId)) {
      current.remove();
      return;
    }
    clearAttributes($, node);
    current.attr("data-asset-id", assetId);
    if (alt) current.attr("alt", alt);
    assetIds.push(assetId);
    return;
  }

  clearAttributes($, node);
}

function clearAttributes($: cheerio.CheerioAPI, node: ArticleElement): void {
  const current = $(node as never);
  for (const name of Object.keys(node.attribs ?? {})) {
    current.removeAttr(name);
  }
}

function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

function articleText(html: string): string {
  const textRoot = cheerio.load(`<div id="article-root">${html}</div>`)("#article-root");
  textRoot.find("br").replaceWith("\n");
  const blocks = textRoot
    .find("p,h1,h2,h3,li,blockquote,pre")
    .toArray()
    .map((element) => cheerio.load(element).text().replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  if (blocks.length > 0) return blocks.join("\n\n");
  return textRoot.text().replace(/\s+/g, " ").trim();
}
