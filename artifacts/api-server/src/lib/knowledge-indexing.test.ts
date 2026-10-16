import { describe, expect, it } from "vitest";
import { articleIndexText, articleNeedsReindex, chunkText } from "./knowledge-indexing";

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

describe("articleIndexText", () => {
  it("places the description between the title and the body so retrieval can read it", () => {
    expect(
      articleIndexText({
        title: "Refunds",
        description: "How customers request a refund.",
        bodyText: "Submit the request in the portal.",
        imageText: "[[image:1]] Receipt",
      }),
    ).toBe(
      "Refunds\n\nDescription: How customers request a refund.\n\nSubmit the request in the portal.\n\n[[image:1]] Receipt",
    );
  });

  it("omits a blank description", () => {
    expect(
      articleIndexText({
        title: "Refunds",
        description: "   ",
        bodyText: "Submit the request in the portal.",
      }),
    ).toBe("Refunds\n\nSubmit the request in the portal.");
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
