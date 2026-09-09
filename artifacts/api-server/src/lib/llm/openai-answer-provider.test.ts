import { describe, expect, it } from "vitest";
import { parseStructuredResponse } from "./openai-answer-provider";

describe("parseStructuredResponse", () => {
  it("reads structured answerability and language", () => {
    expect(
      parseStructuredResponse(
        JSON.stringify({
          answer: "Tu factura está lista.",
          answerable: true,
          replyLanguage: "es",
          citations: [{ citationIndex: 1, assetId: null }],
        }),
      ),
    ).toMatchObject({
      answer: "Tu factura está lista.",
      answerable: true,
      replyLanguage: "es",
    });
  });

  it("safely treats malformed provider output as a normal answer", () => {
    expect(parseStructuredResponse("I could not verify that.")).toEqual({
      answer: "I could not verify that.",
      answerable: true,
      citations: [],
    });
  });
});
