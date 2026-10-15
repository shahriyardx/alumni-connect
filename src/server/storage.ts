import { Client, CopyDestinationOptions, CopySourceOptions } from "minio";
import { env } from "@/env";
import { ALLOWED_MIME, MAX_BYTES } from "@/lib/uploads";

export const minio = new Client({
  endPoint: env.S3_ENDPOINT,
  port: env.S3_PORT,
  useSSL: env.S3_USE_SSL,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
});

export { ALLOWED_MIME, MAX_BYTES };

const EXPIRY_SECONDS = 300;

export function presignPut(key: string): Promise<string> {
  return minio.presignedPutObject(env.S3_BUCKET, key, EXPIRY_SECONDS);
}

/** `mime` is served back as the response Content-Type so the browser never trusts whatever was actually PUT. */
export function presignGet(key: string, mime?: string): Promise<string> {
  return minio.presignedGetObject(
    env.S3_BUCKET,
    key,
    EXPIRY_SECONDS,
    mime
      ? {
          "response-content-type": mime,
          "response-content-disposition": "inline",
        }
      : undefined,
  );
}

export async function stat(
  key: string,
): Promise<{ size: number; contentType?: string; etag: string } | null> {
  try {
    const s = await minio.statObject(env.S3_BUCKET, key);
    return {
      size: s.size,
      contentType: s.metaData?.["content-type"],
      etag: s.etag,
    };
  } catch (e) {
    if ((e as { code?: string }).code === "NotFound") return null;
    throw e;
  }
}

/** First `length` bytes of the object, for magic-byte sniffing. */
export async function readHead(key: string, length: number): Promise<Buffer> {
  const stream = await minio.getPartialObject(env.S3_BUCKET, key, 0, length);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).subarray(0, length);
}

export function remove(key: string): Promise<void> {
  return minio.removeObject(env.S3_BUCKET, key);
}

/**
 * Server-side copy into a key that was never the target of a presigned PUT,
 * so nothing (not even the original uploader) can mutate it after it's been
 * validated. `contentType` is written with `MetadataDirective: "REPLACE"` —
 * the destination's metadata is never inherited from whatever the client
 * claimed on the original PUT.
 */
export async function copy(
  sourceKey: string,
  destKey: string,
  contentType: string,
): Promise<void> {
  await minio.copyObject(
    new CopySourceOptions({ Bucket: env.S3_BUCKET, Object: sourceKey }),
    new CopyDestinationOptions({
      Bucket: env.S3_BUCKET,
      Object: destKey,
      MetadataDirective: "REPLACE",
      Headers: { "Content-Type": contentType },
    }),
  );
}
