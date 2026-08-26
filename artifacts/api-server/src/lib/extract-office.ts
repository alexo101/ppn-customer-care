import mammoth from "mammoth";
import * as XLSX from "xlsx";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const OFFICE_MAX_BYTES = 10 * 1024 * 1024;

export type UploadedOfficeKind = "document" | "spreadsheet";

export function officeKindFromFile(file: { originalname: string; mimetype: string }): UploadedOfficeKind | null {
  const name = file.originalname.toLowerCase();
  if (file.mimetype === DOCX_MIME || name.endsWith(".docx")) return "document";
  if (file.mimetype === XLSX_MIME || name.endsWith(".xlsx")) return "spreadsheet";
  return null;
}

export function isAllowedOfficeUpload(file: { originalname: string; mimetype: string }): boolean {
  return officeKindFromFile(file) !== null;
}

export async function extractOfficeText(
  file: { originalname: string; mimetype: string; buffer: Buffer },
): Promise<{ kind: UploadedOfficeKind; text: string }> {
  const kind = officeKindFromFile(file);
  if (kind === "document") {
    const extracted = await mammoth.extractRawText({ buffer: file.buffer });
    return { kind, text: extracted.value.trim() };
  }
  if (kind === "spreadsheet") {
    return { kind, text: extractSpreadsheetText(file.buffer) };
  }
  throw new Error("Only .docx and .xlsx files are supported");
}

function extractSpreadsheetText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sections = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
    if (!csv) return "";
    return `# ${sheetName}\n${csv}`;
  }).filter(Boolean);
  return sections.join("\n\n").trim();
}
