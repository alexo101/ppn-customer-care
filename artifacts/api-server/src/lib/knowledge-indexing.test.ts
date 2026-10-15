import { describe, expect, it } from "vitest";
import { articleNeedsReindex, chunkText } from "./knowledge-indexing";

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

describe("articleNeedsReindex", () => {
  it("reindexes when the stored model differs or indexing is not ready", () => {
    expect(articleNeedsReindex({ embeddingModel: "old", indexStatus: "ready" }, "new")).toBe(true);
    expect(articleNeedsReindex({ embeddingModel: "new", indexStatus: "error" }, "new")).toBe(true);
    expect(articleNeedsReindex({ embeddingModel: "new", indexStatus: "idle" }, "new")).toBe(true);
    expect(articleNeedsReindex({ embeddingModel: "new", indexStatus: "ready" }, "new")).toBe(false);
    expect(articleNeedsReindex({ embeddingModel: "new", indexStatus: "empty" }, "new")).toBe(false);
  });
});
