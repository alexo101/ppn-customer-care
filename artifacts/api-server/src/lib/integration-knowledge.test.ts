import { describe, expect, it, vi } from "vitest";
import { confluenceHtmlToText, fetchConfluenceDocuments } from "./confluence-knowledge";
import { parseSelectedKnowledgeItems, summarizeSelectedItems } from "./integration-knowledge";
import {
  browseNotionItems,
  notionBlocksToText,
  notionRichTextToPlain,
  notionTitleFromObject,
} from "./notion-knowledge";
import type { ConnectorProxy } from "./replit-integrations";

describe("parseSelectedKnowledgeItems", () => {
  it("keeps valid unique items and drops malformed entries", () => {
    expect(
      parseSelectedKnowledgeItems([
        { id: "abc", type: "page", title: "Home" },
        { id: "abc", type: "page", title: "Home duplicate" },
        { id: "db", type: "database" },
        { id: "", type: "page", title: "Missing id" },
        { type: "space", title: "No id" },
      ]),
    ).toEqual([
      { id: "abc", type: "page", title: "Home", parentTitle: undefined, url: undefined },
      { id: "db", type: "database", title: "db", parentTitle: undefined, url: undefined },
    ]);
  });

  it("summarizes long selections", () => {
    expect(
      summarizeSelectedItems([
        { id: "1", type: "page", title: "A" },
        { id: "2", type: "page", title: "B" },
        { id: "3", type: "space", title: "C" },
      ]),
    ).toBe("A, B +1 more");
  });
});

describe("notionBlocksToText", () => {
  it("converts headings, lists, and nested children to plain text", () => {
    const text = notionBlocksToText([
      { type: "heading_1", heading_1: { rich_text: [{ plain_text: "Policy" }] } },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Refunds are allowed." }] } },
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ plain_text: "Within 30 days" }] },
        children: [
          { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Keep the receipt." }] } },
        ],
      },
    ]);

    expect(text).toContain("# Policy");
    expect(text).toContain("Refunds are allowed.");
    expect(text).toContain("- Within 30 days");
    expect(text).toContain("Keep the receipt.");
  });

  it("reads Notion titles from properties", () => {
    expect(
      notionTitleFromObject({
        properties: {
          Name: { type: "title", title: [{ plain_text: "Billing FAQ" }] },
        },
      }),
    ).toBe("Billing FAQ");
    expect(notionRichTextToPlain([{ plain_text: "Hello" }, { plain_text: " world" }])).toBe(
      "Hello world",
    );
  });
});

describe("confluenceHtmlToText", () => {
  it("strips markup and collapsed whitespace", () => {
    expect(confluenceHtmlToText("<h1>Space</h1><p>Hello&nbsp;<b>world</b></p><script>bad()</script>")).toContain(
      "Space",
    );
    expect(confluenceHtmlToText("<h1>Space</h1><p>Hello&nbsp;<b>world</b></p><script>bad()</script>")).toContain(
      "Hello world",
    );
    expect(confluenceHtmlToText("<h1>Space</h1><p>Hello&nbsp;<b>world</b></p><script>bad()</script>")).not.toContain(
      "bad()",
    );
  });
});

describe("browseNotionItems", () => {
  it("maps searchable pages and databases and keeps the next cursor", async () => {
    const proxy: ConnectorProxy = {
      requestJson: vi.fn().mockResolvedValue({
        has_more: true,
        next_cursor: "cursor-2",
        results: [
          {
            id: "page-1",
            object: "page",
            url: "https://notion.so/page-1",
            properties: { title: { type: "title", title: [{ plain_text: "Refunds" }] } },
          },
          {
            id: "db-1",
            object: "database",
            title: [{ plain_text: "Tickets" }],
          },
        ],
      }),
    };

    const result = await browseNotionItems(proxy, { query: "refund" });
    expect(result.items).toEqual([
      { id: "page-1", type: "page", title: "Refunds", url: "https://notion.so/page-1" },
      { id: "db-1", type: "database", title: "Tickets", url: undefined },
    ]);
    expect(result.nextCursor).toBe("cursor-2");
  });
});

describe("fetchConfluenceDocuments", () => {
  it("fetches selected pages through the connector proxy", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      id: "123",
      title: "Onboarding",
      body: { storage: { value: "<p>Welcome aboard</p>" } },
    });
    const proxy: ConnectorProxy = { requestJson };

    const documents = await fetchConfluenceDocuments(proxy, [
      { id: "123", type: "page", title: "Onboarding" },
    ]);

    expect(documents[0]?.text).toContain("Welcome aboard");
    expect(requestJson).toHaveBeenCalled();
  });
});
