import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Tx } from "@/db";
import { attachment } from "@/db/schema";

export const attachmentColumns = {
  id: attachment.id,
  key: attachment.objectKey,
  mime: attachment.mime,
  kind: attachment.kind,
  size: attachment.size,
  filename: attachment.filename,
};

export type AttachmentItem = {
  id: string;
  key: string;
  mime: string;
  kind: "IMAGE" | "DOCUMENT";
  size: number;
  filename: string | null;
};

/**
 * Binds the caller's own still-unattached uploads to a post or comment.
 * Others' ids, already-used ids and other tenants' ids (RLS) are skipped
 * silently; the caller's zod `.max(MAX_ATTACHMENTS)` caps the count.
 */
export async function claimAttachments(
  tx: Tx,
  ownerId: string,
  ids: string[],
  parent: { postId: string } | { commentId: string },
) {
  if (ids.length === 0) return;
  await tx
    .update(attachment)
    .set(parent)
    .where(
      and(
        inArray(attachment.id, ids),
        eq(attachment.ownerId, ownerId),
        isNull(attachment.postId),
        isNull(attachment.commentId),
      ),
    );
}
