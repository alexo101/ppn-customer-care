import { createHash } from "node:crypto";
import sharp from "sharp";

export const KNOWLEDGE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const KNOWLEDGE_IMAGE_MAX_COUNT = 40;
export const KNOWLEDGE_IMAGE_MAX_PIXELS = 20_000_000;

export const KNOWLEDGE_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export function knowledgeImagesEnabled(): boolean {
  return process.env.KNOWLEDGE_IMAGES_ENABLED?.trim().toLowerCase() !== "false";
}

export type KnowledgeImageMimeType = (typeof KNOWLEDGE_IMAGE_MIME_TYPES)[number];

export type KnowledgeImageInfo = {
  mimeType: KnowledgeImageMimeType;
  width: number | null;
  height: number | null;
  checksum: string;
};

export async function normalizeKnowledgeImage(
  buffer: Buffer,
  declaredMimeType?: string,
): Promise<{ buffer: Buffer; info: KnowledgeImageInfo }> {
  const initial = inspectKnowledgeImage(buffer, declaredMimeType);
  const image = sharp(buffer, { limitInputPixels: KNOWLEDGE_IMAGE_MAX_PIXELS });
  const normalized =
    initial.mimeType === "image/png"
      ? await image.rotate().png().toBuffer()
      : initial.mimeType === "image/webp"
        ? await image.rotate().webp({ quality: 90 }).toBuffer()
        : await image.rotate().jpeg({ quality: 90 }).toBuffer();
  return {
    buffer: normalized,
    info: inspectKnowledgeImage(normalized, initial.mimeType),
  };
}

export function inspectKnowledgeImage(
  buffer: Buffer,
  declaredMimeType?: string,
): KnowledgeImageInfo {
  if (buffer.length === 0 || buffer.length > KNOWLEDGE_IMAGE_MAX_BYTES) {
    throw new Error("Images must be between 1 byte and 8 MB.");
  }

  const detected = detectImage(buffer);
  if (!detected) {
    throw new Error("Only PNG, JPEG, and WebP images are supported.");
  }
  if (
    declaredMimeType &&
    declaredMimeType !== detected.mimeType &&
    !declaredMimeType.startsWith("image/")
  ) {
    throw new Error("The uploaded file is not a valid image.");
  }
  if (
    detected.width &&
    detected.height &&
    detected.width * detected.height > KNOWLEDGE_IMAGE_MAX_PIXELS
  ) {
    throw new Error("The image is too large. Images must be 20 megapixels or smaller.");
  }

  return {
    ...detected,
    checksum: createHash("sha256").update(buffer).digest("hex"),
  };
}

function detectImage(
  buffer: Buffer,
): Omit<KnowledgeImageInfo, "checksum"> | null {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return {
      mimeType: "image/png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const dimensions = jpegDimensions(buffer);
    return { mimeType: "image/jpeg", ...dimensions };
  }

  if (
    buffer.length >= 30 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    const kind = buffer.toString("ascii", 12, 16);
    if (kind === "VP8X" && buffer.length >= 30) {
      const width =
        1 +
        buffer[24] +
        (buffer[25] << 8) +
        (buffer[26] << 16);
      const height =
        1 +
        buffer[27] +
        (buffer[28] << 8) +
        (buffer[29] << 16);
      return { mimeType: "image/webp", width, height };
    }
    return { mimeType: "image/webp", width: null, height: null };
  }

  return null;
}

function jpegDimensions(
  buffer: Buffer,
): { width: number | null; height: number | null } {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isFrame && length >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  return { width: null, height: null };
}
