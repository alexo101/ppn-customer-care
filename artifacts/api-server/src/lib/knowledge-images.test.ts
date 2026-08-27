import { describe, expect, it } from "vitest";
import { inspectKnowledgeImage } from "./knowledge-images";

describe("inspectKnowledgeImage", () => {
  it("accepts PNG signatures and reads dimensions", () => {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(320, 16);
    png.writeUInt32BE(200, 20);

    expect(inspectKnowledgeImage(png, "image/png")).toMatchObject({
      mimeType: "image/png",
      width: 320,
      height: 200,
    });
  });

  it("rejects unsupported formats and forged MIME types", () => {
    expect(() => inspectKnowledgeImage(Buffer.from("not an image"), "image/png")).toThrow(
      /Only PNG/,
    );
  });

  it("rejects oversized dimensions", () => {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(10_000, 16);
    png.writeUInt32BE(10_000, 20);

    expect(() => inspectKnowledgeImage(png, "image/png")).toThrow(/20 megapixels/);
  });
});
