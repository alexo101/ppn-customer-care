import { describe, expect, it } from "vitest";
import { articleKeywordSnippets } from "./article-search";

const sentence =
  "Customers can request a full refund from the billing portal after the order ships today please";

describe("articleKeywordSnippets", () => {
  it("returns five words on each side of a match in the middle", () => {
    expect(articleKeywordSnippets(sentence, "refund")).toEqual([
      {
        before: "Customers can request a full",
        match: "refund",
        after: "from the billing portal after",
      },
    ]);
  });

  it("uses fewer words when the match is near the start or end", () => {
    expect(articleKeywordSnippets(sentence, "Customers").map((snippet) => snippet.before)).toEqual([
      "",
    ]);
    expect(articleKeywordSnippets(sentence, "please")).toEqual([
      {
        before: "after the order ships today",
        match: "please",
        after: "",
      },
    ]);
  });

  it("matches several words together in order", () => {
    expect(articleKeywordSnippets(sentence, "billing portal")).toEqual([
      {
        before: "a full refund from the",
        match: "billing portal",
        after: "after the order ships today",
      },
    ]);
  });

  it("matches regardless of letter case", () => {
    expect(articleKeywordSnippets(sentence, "REFUND")[0]?.match).toBe("refund");
    expect(articleKeywordSnippets("Request a Refund today", "refund")[0]?.match).toBe("Refund");
  });

  it("strips HTML before matching", () => {
    expect(
      articleKeywordSnippets("<p>Request a <strong>refund</strong> from support</p>", "refund"),
    ).toEqual([
      {
        before: "Request a",
        match: "refund",
        after: "from support",
      },
    ]);
  });

  it("returns a snippet for every occurrence", () => {
    expect(articleKeywordSnippets("refund now and refund later", "refund")).toHaveLength(2);
  });

  it("returns nothing for a blank query", () => {
    expect(articleKeywordSnippets(sentence, "   ")).toEqual([]);
  });
});
