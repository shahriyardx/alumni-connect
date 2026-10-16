import { TRPCError } from "@trpc/server";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import type { Me } from "./trpc";

// Plain-text fallback (titles render as text, not markdown).
const LINK_RE = /https?:\/\/|www\.|mailto:/i;
const LINK_NODES = new Set([
  "link",
  "linkReference",
  "definition",
  "image",
  "imageReference",
]);
const NEW_ACCOUNT_MS = 3 * 86_400_000;

type Node = { type: string; url?: string; children?: Node[] };
const hasLinkNode = (n: Node): boolean =>
  LINK_NODES.has(n.type) ||
  n.url !== undefined ||
  !!n.children?.some(hasLinkNode);

/** Same parser stack as the client renderer (react-markdown + remark-gfm), so whatever renders as a link is caught. */
function hasLink(text: string) {
  return (
    LINK_RE.test(text) ||
    hasLinkNode(
      fromMarkdown(text, {
        extensions: [gfm()],
        mdastExtensions: [gfmFromMarkdown()],
      }) as Node,
    )
  );
}

/** New accounts (< 3 days old) may not post links, in any forum text field. */
export function assertCanPostLinks(me: Me, ...texts: string[]) {
  const accountAgeMs = Date.now() - me.createdAt.getTime();
  if (accountAgeMs >= NEW_ACCOUNT_MS) return;
  if (texts.some(hasLink)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "New accounts can post links after 3 days",
    });
  }
}
