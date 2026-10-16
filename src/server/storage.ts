import { TRPCError } from "@trpc/server";
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
 * copied. Metadata (including whatever Content-Type the uploader sent with
 * the PUT) is preserved from the source on purpose: `files.confirm` reads it
 * straight back off this copy as part of validating the *immutable* object,
 * rather than trusting a value that could otherwise have been swapped out
 * between validation and copying. The GET route never relies on this stored
 * value either way — it always overrides the served Content-Type from the
 * validated `attachment.mime` DB column via `presignGet`.
 */
export async function copy(sourceKey: string, destKey: string): Promise<void> {
  await minio.copyObject(
    new CopySourceOptions({ Bucket: env.S3_BUCKET, Object: sourceKey }),
    new CopyDestinationOptions({ Bucket: env.S3_BUCKET, Object: destKey }),
  );
}

export type AllowedMime = keyof typeof ALLOWED_MIME;

export const EXT_TO_MIME = Object.fromEntries(
  Object.entries(ALLOWED_MIME).map(([mime, ext]) => [ext, mime]),
) as Record<string, AllowedMime>;

/** First bytes that identify each allowed image format, regardless of what Content-Type the uploader claimed. */
const MAGIC: Record<AllowedMime, (head: Buffer) => boolean> = {
  "image/png": (h) =>
    h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47,
  "image/jpeg": (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  "image/gif": (h) => h.subarray(0, 4).toString("ascii") === "GIF8",
  "image/webp": (h) =>
    h.subarray(0, 4).toString("ascii") === "RIFF" &&
    h.subarray(8, 12).toString("ascii") === "WEBP",
};

/** `${uni}/${kind}/${id}.${ext}` (staging) → `${uni}/${kind}/f/${id}.${ext}` (server-only). */
export function finalKeyFor(stagingKey: string): string {
  const [uni, kind, file] = stagingKey.split("/");
  return [uni, kind, "f", file].join("/");
}

const notFound = () =>
  new TRPCError({ code: "BAD_REQUEST", message: "Upload not found" });

/**
 * Copies a staging upload to its server-only final key and validates the
 * FINAL copy (size, magic bytes, stored content-type). Validating the copy,
 * not the staging object, closes the TOCTOU window left by the still-valid
 * presigned PUT (minio can't scope a presign to one PUT). Never overwrites an
 * existing final: callers check their own row first, and a final without a
 * row means a crashed or concurrent confirm → CONFLICT. Returns the final
 * key and size; throws TRPCError otherwise (the bad final is removed).
 */
export async function promoteUpload(
  stagingKey: string,
  mime: AllowedMime,
): Promise<{ key: string; size: number }> {
  const finalKey = finalKeyFor(stagingKey);
  if (await stat(finalKey)) {
    await remove(stagingKey).catch(() => {});
    throw new TRPCError({
      code: "CONFLICT",
      message: "Upload already confirmed",
    });
  }
  if (!(await stat(stagingKey))) throw notFound();

  await copy(stagingKey, finalKey);
  await remove(stagingKey).catch(() => {});

  const info = await stat(finalKey);
  if (!info) throw notFound();
  if (info.size > MAX_BYTES) {
    await remove(finalKey);
    throw new TRPCError({ code: "BAD_REQUEST", message: "File too large" });
  }
  // Sniff the real bytes so a .png key can't carry HTML/script content.
  const head = await readHead(finalKey, 16);
  if (!MAGIC[mime](head) || info.contentType !== mime) {
    await remove(finalKey);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "File is not a valid image",
    });
  }
  return { key: finalKey, size: info.size };
}
