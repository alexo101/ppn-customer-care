import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_SOURCE_UNSHARED,
  GoogleSourceError,
  fetchKnowledgeSourceFromUrl,
  googleExportUrl,
  parseKnowledgeSourceUrl,
} from "./fetch-google-source";

describe("parseKnowledgeSourceUrl", () => {
  it("parses Google Doc paste shapes", () => {
    const id = "1AbCDefGhijKLmnopQRstuVWxyz0123456789_-";
    const cases = [
      `https://docs.google.com/document/d/${id}/edit`,
      `https://docs.google.com/document/d/${id}/edit?usp=sharing`,
      `https://docs.google.com/document/u/0/d/${id}/edit`,
      `docs.google.com/document/d/${id}`,
    ];
    for (const raw of cases) {
      const parsed = parseKnowledgeSourceUrl(raw);
      expect(parsed).toMatchObject({ kind: "google-document", fileId: id });
    }
  });

  it("parses Google Sheet paste shapes", () => {
    const id = "1sheetFileId_abcDEF012345";
    const parsed = parseKnowledgeSourceUrl(
      `https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`,
    );
    expect(parsed).toEqual({
      kind: "google-spreadsheet",
      fileId: id,
      url: `https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`,
    });
    expect(
      parseKnowledgeSourceUrl(`https://docs.google.com/spreadsheets/u/1/d/${id}/edit`),
    ).toMatchObject({ kind: "google-spreadsheet", fileId: id });
  });

  it("parses public office file URLs", () => {
    expect(parseKnowledgeSourceUrl("https://files.example.com/policy.docx")).toEqual({
      kind: "office-file",
      officeKind: "document",
      url: "https://files.example.com/policy.docx",
    });
    expect(parseKnowledgeSourceUrl("https://files.example.com/rates.xlsx")).toMatchObject({
      kind: "office-file",
      officeKind: "spreadsheet",
    });
  });

  it("rejects non-https, malformed, and unsupported hosts", () => {
    expect(() => parseKnowledgeSourceUrl("http://docs.google.com/document/d/abc/edit")).toThrow(
      GoogleSourceError,
    );
    expect(() => parseKnowledgeSourceUrl("not a url")).toThrow(GoogleSourceError);
    expect(() => parseKnowledgeSourceUrl("https://example.com/page")).toThrow(GoogleSourceError);
    expect(() => parseKnowledgeSourceUrl("https://docs.google.com/drive/folders/abc")).toThrow(
      /Google Doc or Google Sheet/,
    );
  });

  it("builds first-party export URLs instead of fetching the pasted link", () => {
    const id = "1fileIdValue";
    expect(
      googleExportUrl(parseKnowledgeSourceUrl(`https://docs.google.com/document/d/${id}/edit`)),
    ).toBe(`https://docs.google.com/document/d/${id}/export?format=docx`);
    expect(
      googleExportUrl(parseKnowledgeSourceUrl(`https://docs.google.com/spreadsheets/d/${id}/edit`)),
    ).toBe(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`);
  });
});

describe("fetchKnowledgeSourceFromUrl", () => {
  it("imports a shared Google Doc as plain text", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL) =>
      new Response("Refunds are available within 14 days.", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-disposition": 'attachment; filename="Refund policy.txt"',
        },
      }),
    );

    const result = await fetchKnowledgeSourceFromUrl(
      "https://docs.google.com/document/d/1abc/edit",
      { fetch: fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requested = String(fetchImpl.mock.calls[0]?.[0]);
    expect(requested).toBe("https://docs.google.com/document/d/1abc/export?format=docx");
    expect(result).toMatchObject({
      kind: "document",
      title: "Refund policy",
      text: "Refunds are available within 14 days.",
    });
  });

  it("rejects unauthenticated Google HTML and login redirects", async () => {
    const htmlFetch = vi.fn(async () =>
      new Response("<!DOCTYPE html><html><body>Sign in to continue to Google Docs</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    await expect(
      fetchKnowledgeSourceFromUrl("https://docs.google.com/document/d/1private/edit", {
        fetch: htmlFetch,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: GOOGLE_SOURCE_UNSHARED,
    });

    const redirectFetch = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://accounts.google.com/ServiceLogin" },
      }),
    );
    await expect(
      fetchKnowledgeSourceFromUrl("https://docs.google.com/spreadsheets/d/1private/edit", {
        fetch: redirectFetch,
      }),
    ).rejects.toMatchObject({ message: GOOGLE_SOURCE_UNSHARED });
  });
});
