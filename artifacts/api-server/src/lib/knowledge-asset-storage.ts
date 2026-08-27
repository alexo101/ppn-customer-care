import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const SIGNED_URL_TTL_SECONDS = 10 * 60;

export class KnowledgeAssetStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KnowledgeAssetStorageError";
  }
}

type StorageConfig = {
  bucket: string;
  client: S3Client;
};

let storage: StorageConfig | null | undefined;

function getStorage(): StorageConfig {
  if (storage) return storage;
  if (storage === null) {
    throw new KnowledgeAssetStorageError(
      "Image storage is not configured. Set KNOWLEDGE_ASSET_S3_BUCKET and S3 credentials.",
    );
  }

  const bucket = process.env.KNOWLEDGE_ASSET_S3_BUCKET?.trim();
  const region = process.env.KNOWLEDGE_ASSET_S3_REGION?.trim() || "us-east-1";
  const accessKeyId = process.env.KNOWLEDGE_ASSET_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.KNOWLEDGE_ASSET_S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) {
    storage = null;
    throw new KnowledgeAssetStorageError(
      "Image storage is not configured. Set KNOWLEDGE_ASSET_S3_BUCKET and S3 credentials.",
    );
  }

  const endpoint = process.env.KNOWLEDGE_ASSET_S3_ENDPOINT?.trim();
  storage = {
    bucket,
    client: new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: process.env.KNOWLEDGE_ASSET_S3_FORCE_PATH_STYLE === "true" } : {}),
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return storage;
}

export function resetKnowledgeAssetStorageForTests(): void {
  storage = undefined;
}

export async function putKnowledgeAsset(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const config = getStorage();
  try {
    await config.client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "private, max-age=300",
        Metadata: { purpose: "knowledge-source-asset" },
      }),
    );
  } catch (error) {
    throw new KnowledgeAssetStorageError("Could not store the image.", { cause: error });
  }
}

export async function deleteKnowledgeAsset(key: string): Promise<void> {
  const config = getStorage();
  try {
    await config.client.send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    );
  } catch (error) {
    throw new KnowledgeAssetStorageError("Could not delete the stored image.", { cause: error });
  }
}

export async function signKnowledgeAssetRead(key: string): Promise<string> {
  const config = getStorage();
  try {
    return await getSignedUrl(
      config.client,
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ResponseCacheControl: "private, max-age=300",
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
  } catch (error) {
    throw new KnowledgeAssetStorageError("Could not create an image preview URL.", { cause: error });
  }
}

export async function readKnowledgeAsset(key: string): Promise<Buffer> {
  const config = getStorage();
  try {
    const result = await config.client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (!result.Body) throw new Error("The stored image was empty.");
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (error) {
    throw new KnowledgeAssetStorageError("Could not read the stored image.", { cause: error });
  }
}
