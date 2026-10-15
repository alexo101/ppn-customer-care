import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { articleHasContent, sanitizeArticleHtml } from "./article-html";
import { isArticleRetrievalEligible, passesRetrievalThreshold } from "./retrieval";

describe("sanitizeArticleHtml", () => {
  it("keeps supported formatting and strips scripts and unsafe links", () => {
    const sanitized = sanitizeArticleHtml(
      `<h2>Refunds</h2><p>Contact <a href="javascript:alert(1)">support</a> or <a href="https://example.com">the portal</a>.</p><script>alert(1)</script><img src="https://evil.test/x.png" onerror="alert(1)" data-asset-id="11111111-1111-4111-8111-111111111111" alt="Receipt">`,
    );

    expect(sanitized.html).toContain("<h2>Refunds</h2>");
    expect(sanitized.html).toContain('href="https://example.com"');
    expect(sanitized.html).not.toContain("javascript:");
    expect(sanitized.html).not.toContain("<script>");
    expect(sanitized.html).not.toContain("onerror");
    expect(sanitized.html).not.toContain("https://evil.test");
    expect(sanitized.html).toContain('data-asset-id="11111111-1111-4111-8111-111111111111"');
    expect(sanitized.assetIds).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(sanitized.text).toContain("Refunds");
    expect(articleHasContent(sanitized)).toBe(true);
  });

  it("rejects publishing when the article has no text or images", () => {
    const sanitized = sanitizeArticleHtml("<p>   </p><img data-asset-id=\"not-an-id\">");
    expect(articleHasContent(sanitized)).toBe(false);
  });
});

describe("article retrieval eligibility", () => {
  const matched = new Set(["target-1"]);

  it("allows published global articles and matching targets only", () => {
    expect(isArticleRetrievalEligible({ status: "published", targetId: null }, matched)).toBe(true);
    expect(isArticleRetrievalEligible({ status: "published", targetId: "target-1" }, matched)).toBe(true);
    expect(isArticleRetrievalEligible({ status: "published", targetId: "target-2" }, matched)).toBe(false);
    expect(isArticleRetrievalEligible({ status: "draft", targetId: null }, matched)).toBe(false);
    expect(isArticleRetrievalEligible({ status: "archived", targetId: "target-1" }, matched)).toBe(false);
  });

  it("rejects weak vector matches", () => {
    expect(passesRetrievalThreshold(0.2, 0.45)).toBe(true);
    expect(passesRetrievalThreshold(0.45, 0.45)).toBe(true);
    expect(passesRetrievalThreshold(0.46, 0.45)).toBe(false);
  });
});

describe("article knowledge migration", () => {
  const sql = readFileSync(
    new URL("../../../../lib/db/drizzle/0012_article_knowledge_base.sql", import.meta.url),
    "utf8",
  );

  it("preserves authored articles, drops legacy sources, and purges conversation history", () => {
    expect(sql).toContain('INSERT INTO "knowledge_articles"');
    expect(sql).toContain(`source."source_type" = 'article'`);
    expect(sql).toContain("TRUNCATE TABLE \"conversations\" CASCADE");
    expect(sql).toContain('DROP TABLE IF EXISTS "intent_categories"');
    expect(sql).toContain('DROP TABLE IF EXISTS "orchestrator_rules"');
    expect(sql).toContain('DROP TABLE IF EXISTS "knowledge_sources"');
    expect(sql).toContain('DROP TABLE IF EXISTS "api_connectors"');
    expect(sql).toContain("data-asset-id");
  });
});
