import { Client } from "minio";
import { env } from "@/env";

export const minio = new Client({
  endPoint: env.S3_ENDPOINT,
  port: env.S3_PORT,
  useSSL: env.S3_USE_SSL,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
});

export const ALLOWED_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export const MAX_BYTES = 5 * 1024 * 1024;

const EXPIRY_SECONDS = 300;

export function presignPut(key: string): Promise<string> {
  return minio.presignedPutObject(env.S3_BUCKET, key, EXPIRY_SECONDS);
}

export function presignGet(key: string): Promise<string> {
  return minio.presignedGetObject(env.S3_BUCKET, key, EXPIRY_SECONDS);
}

export async function stat(key: string): Promise<{ size: number } | null> {
  try {
    const s = await minio.statObject(env.S3_BUCKET, key);
    return { size: s.size };
  } catch (e) {
    if ((e as { code?: string }).code === "NotFound") return null;
    throw e;
  }
}

export function remove(key: string): Promise<void> {
  return minio.removeObject(env.S3_BUCKET, key);
}
