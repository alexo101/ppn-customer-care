import * as cheerio from "cheerio";
import { IntegrationProviderError, type ConnectorProxy } from "./replit-integrations";
import type {
  FetchedKnowledgeDocument,
  SelectedKnowledgeItem,
  SourceBrowseResult,
} from "./integration-knowledge";

const PAGE_SIZE = 25;
const MAX_SPACE_PAGES = 40;
const PREFIXES = ["/wiki/rest/api", "/rest/api"];

type ConfluenceListResponse = {
  results?: ConfluenceObject[];
  size?: number;
  start?: number;
  limit?: number;
  _links?: { next?: string };
};

type ConfluenceObject = {
  id?: string | number;
  key?: string;
  name?: string;
  title?: string;
  type?: string;
  body?: { storage?: { value?: string } };
  space?: { name?: string; key?: string };
  _links?: { webui?: string };
};

export function confluenceHtmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style").remove();
  const text = $.root().text();
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function asId(value: unknown): string {
  return value == null ? "" : String(value);
}

async function confluenceGet<T>(
  proxy: ConnectorProxy,
  path: string,
  query: Record<string, string> = {},
): Promise<T> {
  const search = new URLSearchParams(query).toString();
  let lastError: unknown;
  for (const prefix of PREFIXES) {
    try {
      return await proxy.requestJson<T>(`${prefix}${path}${search ? `?${search}` : ""}`, {
        method: "GET",
      });
    } catch (error) {
      lastError = error;
      if (error instanceof IntegrationProviderError && error.code === "not_found") {
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new IntegrationProviderError("Could not reach Confluence.");
}

function nextStart(response: ConfluenceListResponse, currentStart: number, limit: number): number | null {
  const size = response.size ?? response.results?.length ?? 0;
  if (response._links?.next) return currentStart + limit;
  if (size < limit) return null;
  return currentStart + limit;
}

export async function browseConfluenceItems(
  proxy: ConnectorProxy,
  input: { query?: string; cursor?: string; spaceId?: string } = {},
): Promise<SourceBrowseResult> {
  const start = input.cursor ? Number(input.cursor) || 0 : 0;
  if (input.spaceId) {
    const response = await confluenceGet<ConfluenceListResponse>(proxy, "/content", {
      spaceKey: input.spaceId,
      type: "page",
      limit: String(PAGE_SIZE),
      start: String(start),
      expand: "space",
      ...(input.query?.trim() ? { title: input.query.trim() } : {}),
    });
    return {
      items: (response.results ?? []).map((page) => ({
        id: asId(page.id),
        type: "page" as const,
        title: page.title || "Untitled page",
        parentTitle: page.space?.name,
      })),
      nextCursor: nextStart(response, start, PAGE_SIZE)?.toString() ?? null,
      spaceTitle: response.results?.[0]?.space?.name,
    };
  }

  const response = await confluenceGet<ConfluenceListResponse>(proxy, "/space", {
    limit: String(PAGE_SIZE),
    start: String(start),
    ...(input.query?.trim() ? { spaceKey: input.query.trim() } : {}),
  });
  return {
    items: (response.results ?? []).map((space) => ({
      id: space.key || asId(space.id),
      type: "space" as const,
      title: space.name || space.key || "Untitled space",
    })),
    nextCursor: nextStart(response, start, PAGE_SIZE)?.toString() ?? null,
  };
}

async function fetchConfluencePage(
  proxy: ConnectorProxy,
  id: string,
  title: string,
): Promise<FetchedKnowledgeDocument> {
  const page = await confluenceGet<ConfluenceObject>(proxy, `/content/${encodeURIComponent(id)}`, {
    expand: "body.storage,space",
  });
  return {
    itemId: asId(page.id) || id,
    title: page.title || title,
    text: confluenceHtmlToText(page.body?.storage?.value ?? ""),
  };
}

async function fetchSpacePages(
  proxy: ConnectorProxy,
  spaceKey: string,
  spaceTitle: string,
): Promise<FetchedKnowledgeDocument[]> {
  const documents: FetchedKnowledgeDocument[] = [];
  let start = 0;
  while (documents.length < MAX_SPACE_PAGES) {
    const response = await confluenceGet<ConfluenceListResponse>(proxy, "/content", {
      spaceKey,
      type: "page",
      limit: String(PAGE_SIZE),
      start: String(start),
      expand: "body.storage,space",
    });
    const results = response.results ?? [];
    for (const page of results) {
      if (!page.id) continue;
      documents.push({
        itemId: asId(page.id),
        title: page.title || `${spaceTitle} page`,
        text: confluenceHtmlToText(page.body?.storage?.value ?? ""),
      });
      if (documents.length >= MAX_SPACE_PAGES) break;
    }
    const next = nextStart(response, start, PAGE_SIZE);
    if (next == null) break;
    start = next;
  }
  return documents;
}

export async function fetchConfluenceDocuments(
  proxy: ConnectorProxy,
  selected: SelectedKnowledgeItem[],
): Promise<FetchedKnowledgeDocument[]> {
  const documents: FetchedKnowledgeDocument[] = [];
  for (const item of selected) {
    if (item.type === "space") {
      documents.push(...(await fetchSpacePages(proxy, item.id, item.title)));
      continue;
    }
    if (item.type === "page") {
      documents.push(await fetchConfluencePage(proxy, item.id, item.title));
    }
  }
  if (selected.length > 0 && documents.length === 0) {
    throw new IntegrationProviderError(
      "No readable Confluence content was found for the selected items.",
      { code: "not_found" },
    );
  }
  return documents;
}
