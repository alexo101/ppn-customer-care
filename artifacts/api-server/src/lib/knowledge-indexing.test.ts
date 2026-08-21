import { describe, expect, it } from "vitest";
import { chunkText } from "./knowledge-indexing";

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
