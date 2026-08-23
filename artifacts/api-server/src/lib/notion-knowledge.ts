import { IntegrationProviderError, type ConnectorProxy } from "./replit-integrations";
import type {
  FetchedKnowledgeDocument,
  SelectedKnowledgeItem,
  SourceBrowseResult,
} from "./integration-knowledge";

const NOTION_VERSION = "2022-06-28";
const PAGE_SIZE = 25;
const MAX_BLOCKS = 250;
const MAX_DATABASE_PAGES = 40;

type NotionSearchResponse = {
  results?: NotionObject[];
  next_cursor?: string | null;
  has_more?: boolean;
};

type NotionObject = {
  id?: string;
  object?: string;
  url?: string;
  title?: NotionRichText[];
  properties?: Record<string, NotionProperty>;
  parent?: { type?: string; page_id?: string; database_id?: string };
};

type NotionProperty = {
  type?: string;
  title?: NotionRichText[];
};

type NotionRichText = {
  plain_text?: string;
};

type NotionBlock = {
  id?: string;
  type?: string;
  has_children?: boolean;
  [key: string]: unknown;
};

type NotionBlockList = {
  results?: NotionBlock[];
  next_cursor?: string | null;
  has_more?: boolean;
};

type NotionQueryResponse = {
  results?: Array<{ id?: string }>;
  next_cursor?: string | null;
  has_more?: boolean;
};

function notionHeaders(): Record<string, string> {
  return { "Notion-Version": NOTION_VERSION };
}

export function notionRichTextToPlain(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (item && typeof item === "object" && "plain_text" in item) {
        return String((item as NotionRichText).plain_text ?? "");
      }
      return "";
    })
    .join("");
}

export function notionTitleFromObject(object: NotionObject): string {
  if (Array.isArray(object.title)) {
    const title = notionRichTextToPlain(object.title);
    if (title) return title;
  }
  for (const property of Object.values(object.properties ?? {})) {
    if (property?.type === "title") {
      const title = notionRichTextToPlain(property.title);
      if (title) return title;
    }
  }
  return "Untitled";
}

export function notionBlocksToText(blocks: NotionBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    const type = typeof block.type === "string" ? block.type : "";
    const data = (type && block[type] && typeof block[type] === "object"
      ? (block[type] as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const rich = notionRichTextToPlain(data.rich_text);
    switch (type) {
      case "heading_1":
        if (rich) lines.push(`# ${rich}`);
        break;
      case "heading_2":
        if (rich) lines.push(`## ${rich}`);
        break;
      case "heading_3":
        if (rich) lines.push(`### ${rich}`);
        break;
      case "bulleted_list_item":
        if (rich) lines.push(`- ${rich}`);
        break;
      case "numbered_list_item":
        if (rich) lines.push(`1. ${rich}`);
        break;
      case "to_do":
        lines.push(`${data.checked ? "[x]" : "[ ]"} ${rich}`.trim());
        break;
      case "quote":
      case "callout":
        if (rich) lines.push(rich);
        break;
      case "code":
        if (rich) lines.push(rich);
        break;
      case "child_page":
      case "child_database":
        if (typeof data.title === "string" && data.title.trim()) lines.push(data.title.trim());
        break;
      case "table_row":
        if (Array.isArray(data.cells)) {
          lines.push(data.cells.map((cell) => notionRichTextToPlain(cell)).join(" | "));
        }
        break;
      default:
        if (rich) lines.push(rich);
    }
    const children = Array.isArray(block.children) ? (block.children as NotionBlock[]) : [];
    if (children.length > 0) {
      const nested = notionBlocksToText(children);
      if (nested) lines.push(nested);
    }
  }
  return lines.filter((line) => line.trim()).join("\n");
}

async function fetchBlockChildren(
  proxy: ConnectorProxy,
  blockId: string,
  remaining = MAX_BLOCKS,
): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | null = null;
  while (blocks.length < remaining) {
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) params.set("start_cursor", cursor);
    const page: NotionBlockList = await proxy.requestJson<NotionBlockList>(
      `/v1/blocks/${encodeURIComponent(blockId)}/children?${params.toString()}`,
      { method: "GET", headers: notionHeaders() },
    );
    const results = page.results ?? [];
    for (const block of results) {
      if (blocks.length >= remaining) break;
      if (block.has_children && block.id) {
        block.children = await fetchBlockChildren(proxy, block.id, remaining - blocks.length - 1);
      }
      blocks.push(block);
    }
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return blocks;
}

async function fetchPageDocument(
  proxy: ConnectorProxy,
  item: SelectedKnowledgeItem,
): Promise<FetchedKnowledgeDocument> {
  const blocks = await fetchBlockChildren(proxy, item.id);
  return {
    itemId: item.id,
    title: item.title,
    text: notionBlocksToText(blocks),
  };
}

async function fetchDatabaseDocuments(
  proxy: ConnectorProxy,
  item: SelectedKnowledgeItem,
): Promise<FetchedKnowledgeDocument[]> {
  const documents: FetchedKnowledgeDocument[] = [];
  let cursor: string | null = null;
  while (documents.length < MAX_DATABASE_PAGES) {
    const page: NotionQueryResponse = await proxy.requestJson<NotionQueryResponse>(
      `/v1/databases/${encodeURIComponent(item.id)}/query`,
      {
        method: "POST",
        headers: notionHeaders(),
        body: {
          page_size: Math.min(PAGE_SIZE, MAX_DATABASE_PAGES - documents.length),
          ...(cursor ? { start_cursor: cursor } : {}),
        },
      },
    );
    for (const row of page.results ?? []) {
      if (!row.id) continue;
      documents.push(
        await fetchPageDocument(proxy, {
          id: row.id,
          type: "page",
          title: `${item.title} item`,
        }),
      );
    }
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return documents;
}

export async function browseNotionItems(
  proxy: ConnectorProxy,
  input: { query?: string; cursor?: string } = {},
): Promise<SourceBrowseResult> {
  const body: Record<string, unknown> = { page_size: PAGE_SIZE };
  if (input.query?.trim()) body.query = input.query.trim();
  if (input.cursor) body.start_cursor = input.cursor;

  const response = await proxy.requestJson<NotionSearchResponse>("/v1/search", {
    method: "POST",
    headers: notionHeaders(),
    body,
  });

  const items = (response.results ?? [])
    .filter((object) => object.id && (object.object === "page" || object.object === "database"))
    .map((object) => ({
      id: String(object.id),
      type: object.object === "database" ? ("database" as const) : ("page" as const),
      title: notionTitleFromObject(object),
      url: typeof object.url === "string" ? object.url : undefined,
    }));

  return {
    items,
    nextCursor: response.has_more ? response.next_cursor ?? null : null,
  };
}

export async function fetchNotionDocuments(
  proxy: ConnectorProxy,
  selected: SelectedKnowledgeItem[],
): Promise<FetchedKnowledgeDocument[]> {
  const documents: FetchedKnowledgeDocument[] = [];
  for (const item of selected) {
    if (item.type === "database") {
      documents.push(...(await fetchDatabaseDocuments(proxy, item)));
      continue;
    }
    if (item.type === "page") {
      documents.push(await fetchPageDocument(proxy, item));
    }
  }
  if (selected.length > 0 && documents.length === 0) {
    throw new IntegrationProviderError("No readable Notion content was found for the selected items.", {
      code: "not_found",
    });
  }
  return documents;
}
