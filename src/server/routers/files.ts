import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { attachment } from "@/db/schema";
import {
  ALLOWED_MIME,
  copy,
  MAX_BYTES,
  presignPut,
  readHead,
  remove,
  stat,
} from "../storage";
import { memberProcedure, router } from "../trpc";

const EXT_TO_MIME = Object.fromEntries(
  Object.entries(ALLOWED_MIME).map(([mime, ext]) => [ext, mime]),
) as Record<string, keyof typeof ALLOWED_MIME>;

/** First bytes that identify each allowed image format, regardless of what Content-Type the uploader claimed. */
const MAGIC: Record<keyof typeof ALLOWED_MIME, (head: Buffer) => boolean> = {
  "image/png": (h) =>
    h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47,
  "image/jpeg": (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  "image/gif": (h) => h.subarray(0, 4).toString("ascii") === "GIF8",
  "image/webp": (h) =>
    h.subarray(0, 4).toString("ascii") === "RIFF" &&
    h.subarray(8, 12).toString("ascii") === "WEBP",
};

export const filesRouter = router({
  createUpload: memberProcedure
    .input(
      z.object({
        kind: z.enum(["avatar", "attachment"]),
        mime: z.enum(Object.keys(ALLOWED_MIME) as [keyof typeof ALLOWED_MIME]),
        size: z.number().int().min(1).max(MAX_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ext = ALLOWED_MIME[input.mime];
      const key = `${ctx.me.universityId}/${input.kind}/${randomUUID()}.${ext}`;
      const url = await presignPut(key);
      return { key, url };
    }),

  confirm: memberProcedure
    .input(z.object({ key: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!input.key.startsWith(`${ctx.me.universityId}/`)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const shapeRe = new RegExp(
        `^${ctx.me.universityId}/(avatar|attachment)/[0-9a-f-]{36}\\.(png|jpg|webp|gif)$`,
      );
      if (!shapeRe.test(input.key)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload not found",
        });
      }

      // `input.key` is a *staging* key: it's where the presigned PUT landed,
      // and that presigned URL stays valid for 300s after this call returns
      // (minio can't scope a presign to "one PUT only"). If we validated and
      // then kept serving that same key, the uploader could silently PUT
      // different bytes to it afterwards (TOCTOU) and have them served as
      // the already-"confirmed" attachment. So: validate the staging
      // object, copy it to a FINAL key that was never the target of any
      // presigned URL, store *that* key, and delete the staging object.
      //
      // Idempotency: NOT idempotent once the staging object is consumed.
      // The first successful call copies+deletes the staging object and
      // inserts the attachment row; any later call with the same staging
      // key hits `stat()` on a now-missing object and gets the same
      // "Upload not found" error as a key that was never uploaded to. Two
      // concurrent calls racing on the same still-present staging key both
      // copy identical source bytes to the same deterministic final key
      // (harmless) and race on the insert, which `onConflictDoNothing` +
      // re-select (below) already resolves.
      const info = await stat(input.key);
      if (!info) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload not found",
        });
      }
      if (info.size > MAX_BYTES) {
        await remove(input.key);
        throw new TRPCError({ code: "BAD_REQUEST", message: "File too large" });
      }

      const ext = input.key.slice(input.key.lastIndexOf(".") + 1);
      const mime = EXT_TO_MIME[ext];

      // Don't trust the Content-Type the uploader sent with the PUT, or the
      // extension in the key: sniff the real bytes so a .png key can't be
      // used to serve e.g. HTML/script content back out of /api/files.
      const head = await readHead(input.key, 16);
      if (!mime || !MAGIC[mime](head) || info.contentType !== mime) {
        await remove(input.key);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File is not a valid image",
        });
      }

      const segments = input.key.split("/");
      const finalKey = [segments[0], segments[1], "f", segments[2]].join("/");

      await copy(input.key, finalKey, mime);
      const finalInfo = await stat(finalKey);
      if (!finalInfo || finalInfo.size > MAX_BYTES) {
        await remove(finalKey);
        await remove(input.key);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload not found",
        });
      }
      await remove(input.key);

      const [row] = await ctx.db
        .insert(attachment)
        .values({
          universityId: ctx.me.universityId,
          ownerId: ctx.me.id,
          objectKey: finalKey,
          mime,
          size: finalInfo.size,
        })
        .onConflictDoNothing({ target: attachment.objectKey })
        .returning({ id: attachment.id, objectKey: attachment.objectKey });

      if (row) return { id: row.id, key: row.objectKey };

      const [again] = await ctx.db
        .select({ id: attachment.id, objectKey: attachment.objectKey })
        .from(attachment)
        .where(eq(attachment.objectKey, finalKey));
      return { id: again.id, key: again.objectKey };
    }),
});
