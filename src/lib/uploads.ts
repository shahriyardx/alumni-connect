/** Shared between the server (storage.ts) and the client (image-uploader.tsx) — no env/node imports here. */
export const ALLOWED_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export const MAX_BYTES = 5 * 1024 * 1024;
