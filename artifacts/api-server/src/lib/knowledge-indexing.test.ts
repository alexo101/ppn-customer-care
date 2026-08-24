import { describe, expect, it } from "vitest";
import { chunkText, isIndexableSourceType, sourceNeedsReindex } from "./knowledge-indexing";

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
    expect(isIndexableSourceType("spreadsheet")).toBe(false);
  });
});
