import mammoth from "mammoth";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { inspectKnowledgeImage, type KnowledgeImageInfo } from "./knowledge-images";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const OFFICE_MAX_BYTES = 10 * 1024 * 1024;

export type UploadedOfficeKind = "document" | "spreadsheet";

export type ExtractedOfficeImage = KnowledgeImageInfo & {
  buffer: Buffer;
  originalName: string;
  position: number;
};

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
): Promise<{ kind: UploadedOfficeKind; text: string; images: ExtractedOfficeImage[] }> {
  const kind = officeKindFromFile(file);
  if (kind === "document") {
    const extracted = await mammoth.extractRawText({ buffer: file.buffer });
    return { kind, text: extracted.value.trim(), images: await extractOfficeImages(file.buffer, "word/media") };
  }
  if (kind === "spreadsheet") {
    return { kind, text: extractSpreadsheetText(file.buffer), images: await extractOfficeImages(file.buffer, "xl/media") };
  }
  throw new Error("Only .docx and .xlsx files are supported");
}

async function extractOfficeImages(
  buffer: Buffer,
  prefix: "word/media" | "xl/media",
): Promise<ExtractedOfficeImage[]> {
  const archive = await JSZip.loadAsync(buffer);
  const entries = Object.values(archive.files)
    .filter((entry) => !entry.dir && entry.name.startsWith(`${prefix}/`))
    .sort((left, right) => left.name.localeCompare(right.name));
  const images: ExtractedOfficeImage[] = [];
  for (const [position, entry] of entries.entries()) {
    const imageBuffer = await entry.async("nodebuffer");
    try {
      const info = inspectKnowledgeImage(imageBuffer, mimeTypeFromName(entry.name));
      images.push({
        ...info,
        buffer: imageBuffer,
        originalName: entry.name.split("/").at(-1) || `image-${position + 1}`,
        position,
      });
    } catch {
      // Office files can contain unsupported decorative media. Keep text extraction
      // usable and ignore those files rather than failing the whole source.
    }
  }
  return images;
}

function mimeTypeFromName(name: string): string | undefined {
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return undefined;
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
