import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchKnowledgeSourceFromUrl } = vi.hoisted(() => ({
  fetchKnowledgeSourceFromUrl: vi.fn(),
}));

vi.mock("./fetch-google-source", () => ({
  fetchKnowledgeSourceFromUrl,
}));

import {
  chunkText,
  isIndexableSourceType,
  mergeRemoteSourceConfig,
  sourceNeedsReindex,
} from "./knowledge-indexing";

describe("chunkText", () => {
  it("combines short paragraphs without exceeding the configured size", () => {
    const chunks = chunkText("One two.\n\nThree four.", {
      maxChars: 20,
      overlap: 0,
    });

    expect(chunks).toEqual(["One two. Three four."]);
  });

  it("splits long paragraphs with overlap", () => {
    const chunks = chunkText("abcdefghijklmnopqrstuvwxyz", {
      maxChars: 10,
      overlap: 3,
    });

    expect(chunks).toEqual(["abcdefghij", "hijklmnopq", "opqrstuvwx", "vwxyz"]);
    expect(chunks.every((chunk) => chunk.length <= 10)).toBe(true);
  });

  it("removes empty paragraphs", () => {
    expect(chunkText("\n\n  \n\nSupport is available.")).toEqual([
      "Support is available.",
    ]);
  });
});

describe("sourceNeedsReindex", () => {
  it("reindexes when the stored model differs or indexing is not ready", () => {
    expect(sourceNeedsReindex({ embeddingModel: "old", syncStatus: "ready" }, "new")).toBe(true);
    expect(sourceNeedsReindex({ embeddingModel: "new", syncStatus: "error" }, "new")).toBe(true);
    expect(sourceNeedsReindex({ embeddingModel: "new", syncStatus: "idle" }, "new")).toBe(true);
    expect(sourceNeedsReindex({ embeddingModel: "new", syncStatus: "ready" }, "new")).toBe(false);
    expect(sourceNeedsReindex({ embeddingModel: "new", syncStatus: "empty" }, "new")).toBe(false);
  });

  it("treats documents and articles as indexable", () => {
    expect(isIndexableSourceType("document")).toBe(true);
    expect(isIndexableSourceType("article")).toBe(true);
    expect(isIndexableSourceType("spreadsheet")).toBe(true);
    expect(isIndexableSourceType("notion")).toBe(false);
  });
});

describe("mergeRemoteSourceConfig", () => {
  beforeEach(() => {
    fetchKnowledgeSourceFromUrl.mockReset();
  });

  it("re-exports linked Google files and replaces stored text", async () => {
    fetchKnowledgeSourceFromUrl.mockResolvedValue({
      kind: "document",
      title: "Refund policy",
      text: "Updated refund body",
      url: "https://docs.google.com/document/d/1abc/edit",
      mimeType: "text/plain",
    });

    const next = await mergeRemoteSourceConfig("document", {
      url: "https://docs.google.com/document/d/1abc/edit",
      text: "Old body",
      fileName: "Old",
    });

    expect(fetchKnowledgeSourceFromUrl).toHaveBeenCalledWith(
      "https://docs.google.com/document/d/1abc/edit",
    );
    expect(next).toMatchObject({
      text: "Updated refund body",
      fileName: "Refund policy",
    });
  });

  it("leaves local uploads unchanged when no url is stored", async () => {
    await expect(
      mergeRemoteSourceConfig("spreadsheet", { text: "a,b", fileName: "rates.xlsx" }),
    ).resolves.toBeNull();
    expect(fetchKnowledgeSourceFromUrl).not.toHaveBeenCalled();
  });
});
