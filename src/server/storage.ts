import { TRPCError } from "@trpc/server";
import { Client, CopyDestinationOptions, CopySourceOptions } from "minio";
import { env } from "@/env";
import {
  ALLOWED_MIME,
  FILE_TYPES,
  type FileType,
  MAX_BYTES,
  maxBytesFor,
} from "@/lib/uploads";
import { sniff } from "./sniff";

export const minio = new Client({
  endPoint: env.S3_ENDPOINT,
  port: env.S3_PORT,
  useSSL: env.S3_USE_SSL,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
});

export { ALLOWED_MIME, MAX_BYTES };

const EXPIRY_SECONDS = 300;

/**
 * Presigned POST for every upload: unlike a presigned PUT, the policy pins
 * the key and content-type and caps the size, so MinIO itself rejects
 * anything over `maxBytes` (per type: images 5 MB, text 2 MB, docs 20 MB).
 */
export async function presignPost(
  key: string,
  mime: string,
  maxBytes = MAX_BYTES,
): Promise<{ url: string; fields: Record<string, string> }> {
  const policy = minio.newPostPolicy();
  policy.setBucket(env.S3_BUCKET);
  policy.setKey(key);
  policy.setContentType(mime);
  policy.setContentLengthRange(1, maxBytes);
  policy.setExpires(new Date(Date.now() + EXPIRY_SECONDS * 1000));
  const { postURL, formData } = await minio.presignedPostPolicy(policy);
  return { url: postURL, fields: formData };
}

/** `mime` is served back as the response Content-Type so the browser never trusts whatever was actually uploaded. */
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

/** `length` bytes of the object at `offset`, for magic-byte sniffing. */
export async function readRange(
  key: string,
  offset: number,
  length: number,
): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0);
  const stream = await minio.getPartialObject(
    env.S3_BUCKET,
    key,
    offset,
    length,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).subarray(0, length);
}

export const readHead = (key: string, length: number) =>
  readRange(key, 0, length);

/** Whole object as a stream (documents are proxied, never redirected). */
export function getObject(key: string) {
  return minio.getObject(env.S3_BUCKET, key);
}

export function remove(key: string): Promise<void> {
  return minio.removeObject(env.S3_BUCKET, key);
}

/**
 * Server-side copy into a key that was never the target of a presigned POST,
 * so nothing (not even the original uploader) can mutate it after it's been
 * copied. Metadata (including whatever Content-Type the uploader sent with
 * the upload) is preserved from the source on purpose: `files.confirm` reads it
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

const IMAGE_TYPES = Object.fromEntries(
  Object.entries(ALLOWED_MIME).map(([mime, ext]) => [mime, FILE_TYPES[ext]]),
) as Record<AllowedMime, FileType>;

export const EXT_TO_MIME = Object.fromEntries(
  Object.entries(ALLOWED_MIME).map(([mime, ext]) => [ext, mime]),
) as Record<string, AllowedMime>;

/**
 * Staging → server-only final key: `${uni}/${kind}/${id}.${ext}` and
 * `${uni}/staging/${kind}/${id}.${ext}` both → `${uni}/${kind}/f/${id}.${ext}`.
 */
export function finalKeyFor(stagingKey: string): string {
  const parts = stagingKey.split("/");
  const file = parts.pop();
  const kind = parts.pop();
  return [parts[0], kind, "f", file].join("/");
}

const notFound = () =>
  new TRPCError({ code: "BAD_REQUEST", message: "Upload not found" });

/**
 * Copies a staging upload to its server-only final key and validates the
 * FINAL copy (size, magic bytes, stored content-type). Validating the copy,
 * not the staging object, closes the TOCTOU window left by the still-valid
 * presigned POST (minio can't scope a presign to one upload). Never overwrites an
 * existing final: callers check their own row first, and a final without a
 * row means a crashed or concurrent confirm → CONFLICT. Returns the final
 * key and size; throws TRPCError otherwise (the bad final is removed).
 */
export async function promoteUpload(
  stagingKey: string,
  mimeOrType: AllowedMime | FileType,
): Promise<{ key: string; size: number }> {
  const type =
    typeof mimeOrType === "string" ? IMAGE_TYPES[mimeOrType] : mimeOrType;
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
  if (info.size > maxBytesFor(type)) {
    await remove(finalKey);
    throw new TRPCError({ code: "BAD_REQUEST", message: "File too large" });
  }
  // Sniff the real bytes so a .png/.pdf key can't carry HTML/script content.
  const ext = finalKey.slice(finalKey.lastIndexOf(".") + 1);
  const ok =
    info.contentType === type.mime &&
    (await sniff(
      (offset, length) => readRange(finalKey, offset, length),
      info.size,
      type,
      ext,
    ));
  if (!ok) {
    await remove(finalKey);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        type.icon === "image"
          ? "File is not a valid image"
          : "File doesn't match its type",
    });
  }
  return { key: finalKey, size: info.size };
}
