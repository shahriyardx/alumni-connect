import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { attachment } from "@/db/schema";
import {
  ALLOWED_MIME,
  EXT_TO_MIME,
  finalKeyFor,
  MAX_BYTES,
  presignPut,
  promoteUpload,
  remove,
} from "../storage";
import { memberProcedure, router } from "../trpc";

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

      const ext = input.key.slice(input.key.lastIndexOf(".") + 1);
      const mime = EXT_TO_MIME[ext];
      if (!mime) {
        // Unreachable given shapeRe's extension group — keeps `mime` typed
        // as non-optional below without a cast.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload not found",
        });
      }

      // `input.key` is a *staging* key: it's where the presigned PUT landed,
      // and that presigned URL stays valid for 300s after this call returns
      // (minio can't scope a presign to "one PUT only"). Two separate
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
      //    be confirmed, re-PUT with different bytes, and confirmed again
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
      const finalInfo = await promoteUpload(input.key, mime);

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
