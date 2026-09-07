import { describe, expect, it } from "vitest";
import { sanitizeExtractedText } from "./extract-office";

describe("sanitizeExtractedText", () => {
  it("removes NUL characters while preserving readable Unicode text", () => {
    expect(sanitizeExtractedText("Billing \u0000FAQs 🔥\n\nNext section")).toBe(
      "Billing FAQs 🔥\n\nNext section",
    );
  });

  it("trims extracted document text", () => {
    expect(sanitizeExtractedText("  Document content \n")).toBe("Document content");
  });
});