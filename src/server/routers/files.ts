import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { attachment } from "@/db/schema";
import {
  ALL_EXTS,
  FILE_TYPES,
  IMAGE_EXTS,
  isImageType,
  MAX_DOC_BYTES,
  maxBytesFor,
  sanitizeFilename,
} from "@/lib/uploads";
import { finalKeyFor, presignPost, promoteUpload, remove } from "../storage";
import { memberProcedure, router } from "../trpc";

export const filesRouter = router({
  /**
   * Presigned POST (key, content-type and size range pinned by the policy).
   * Avatars/logos are images only; post/comment attachments also take
   * documents. The extension decides the type; the client's MIME is ignored.
   */
  createUpload: memberProcedure
    .input(
      z.object({
        kind: z.enum(["avatar", "attachment", "logo"]),
        ext: z.enum(ALL_EXTS as [string, ...string[]]),
        size: z.number().int().min(1).max(MAX_DOC_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.kind === "logo" && ctx.me.role !== "OWNER")
        throw new TRPCError({ code: "FORBIDDEN" });
      const type = FILE_TYPES[input.ext];
      if (input.kind !== "attachment" && !isImageType(type))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only images are allowed here",
        });
      const max = maxBytesFor(type);
      if (input.size > max)
        throw new TRPCError({ code: "BAD_REQUEST", message: "File too large" });
      const ext = input.ext === "jpeg" ? "jpg" : input.ext;
      const key = `${ctx.me.universityId}/${input.kind}/${randomUUID()}.${ext}`;
      const post = await presignPost(key, type.mime, max);
      return { key, ...post };
    }),

  confirm: memberProcedure
    .input(
      z.object({
        key: z.string().min(1),
        /** Original file name, shown on download (sanitized). */
        name: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.key.startsWith(`${ctx.me.universityId}/`)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const shapeRe = new RegExp(
        `^${ctx.me.universityId}/(avatar|attachment|logo)/[0-9a-f-]{36}\\.(${ALL_EXTS.join("|")})$`,
      );
      if (!shapeRe.test(input.key)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload not found",
        });
      }

      if (
        input.key.startsWith(`${ctx.me.universityId}/logo/`) &&
        ctx.me.role !== "OWNER"
      )
        throw new TRPCError({ code: "FORBIDDEN" });

      const ext = input.key.slice(input.key.lastIndexOf(".") + 1);
      const type = FILE_TYPES[ext];
      if (!input.key.includes("/attachment/") && !IMAGE_EXTS.includes(ext)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload not found",
        });
      }

      // `input.key` is a *staging* key: it's where the presigned POST landed,
      // and that presigned policy stays valid for 300s after this call returns
      // (minio can't scope a presign to "one upload only"). Two separate
      // attacks follow from that, both closed below:
      //
      // 1. TOCTOU on validation: if we validated the staging object and
      //    *then* copied it, the bytes could be swapped in between. So we
      //    copy FIRST, into a FINAL key that no presigned URL ever targets,
      //    and validate (size, magic bytes, stored content-type) only the
      //    immutable final copy. The staging object itself gets no content
      //    validation — only an existence check — since nothing it says
      //    about itself can be trusted to still be true a moment later.
      // 2. Overwriting an already-confirmed final: the same staging key can
      //    be confirmed, re-POSTed with different bytes, and confirmed again
      //    inside the 300s window. So before copying, check whether this
      //    staging key's final key already has an attachment row; if so,
      //    hand back that existing attachment untouched and never copy
      //    over it.
      //
      // Idempotency, chosen and documented here: NOT idempotent once the
      // staging object has been consumed by a *first* successful confirm
      // that hasn't been immediately re-confirmed — i.e. once the final
      // object has no row AND the staging object is gone, a later confirm
      // call for that staging key fails with "Upload not found" (same as a
      // key that was never uploaded to). While an attachment row DOES exist
      // for the final key, every later confirm call for that staging key is
      // idempotent and returns the same attachment.
      const finalKey = finalKeyFor(input.key);

      const [existingRow] = await ctx.db
        .select({ id: attachment.id, objectKey: attachment.objectKey })
        .from(attachment)
        .where(eq(attachment.objectKey, finalKey));
      if (existingRow) {
        await remove(input.key).catch(() => {});
        return { id: existingRow.id, key: existingRow.objectKey };
      }
      const finalInfo = await promoteUpload(input.key, type);

      // Two concurrent confirms racing on the same still-present staging
      // key both get here, both copy identical source bytes to the same
      // deterministic final key (harmless), and race on this insert —
      // resolved by `onConflictDoNothing` + re-select, same as before.
      const [row] = await ctx.db
        .insert(attachment)
        .values({
          universityId: ctx.me.universityId,
          ownerId: ctx.me.id,
          objectKey: finalKey,
          mime: type.mime,
          size: finalInfo.size,
          kind: isImageType(type) ? "IMAGE" : "DOCUMENT",
          filename: sanitizeFilename(input.name, ext),
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
