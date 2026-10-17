import type { Check, FileType } from "@/lib/uploads";

/** Reads `length` bytes at `offset` of the object (may return fewer at EOF). */
export type Reader = (offset: number, length: number) => Promise<Buffer>;

const HEAD = 64 * 1024;
const ascii = (b: Buffer, from: number, to: number) =>
  b.subarray(from, to).toString("latin1");

/** Entry names from a zip's central directory (bounded reads, no zip lib). */
async function zipNames(read: Reader, size: number): Promise<string[] | null> {
  const tailLen = Math.min(size, HEAD + 22);
  const tail = await read(size - tailLen, tailLen);
  const eocd = tail.lastIndexOf(Buffer.from("PK\x05\x06", "latin1"));
  if (eocd < 0 || eocd + 22 > tail.length) return null;
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  // ponytail: 1 MB central-directory cap (~10k entries); real office files are far below.
  if (cdOffset + cdSize > size || cdSize > 1024 * 1024) return null;
  const cd = await read(cdOffset, cdSize);
  const names: string[] = [];
  for (let p = 0; p + 46 <= cd.length; ) {
    if (cd.readUInt32LE(p) !== 0x02014b50) return null;
    const nameLen = cd.readUInt16LE(p + 28);
    const extra = cd.readUInt16LE(p + 30);
    const comment = cd.readUInt16LE(p + 32);
    names.push(cd.subarray(p + 46, p + 46 + nameLen).toString("utf8"));
    p += 46 + nameLen + extra + comment;
  }
  return names;
}

const isZip = (h: Buffer) => ascii(h, 0, 4) === "PK\x03\x04";

async function ooxml(read: Reader, size: number, h: Buffer, dir: string) {
  if (!isZip(h)) return false;
  const names = await zipNames(read, size);
  return (
    !!names &&
    names.includes("[Content_Types].xml") &&
    names.some((n) => n.startsWith(dir))
  );
}

/** OLE2: magic, then the main stream's name in the first directory sector. */
async function ole(read: Reader, size: number, h: Buffer, ext: string) {
  if (h.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") return false;
  const shift = h.readUInt16LE(30);
  if (shift !== 9 && shift !== 12) return false;
  const sector = 1 << shift;
  const at = (h.readUInt32LE(48) + 1) * sector;
  if (at + sector > size) return false;
  // ponytail: only the first directory sector is checked; Office always puts its main stream there.
  const dir = await read(at, sector);
  const want = {
    doc: ["WordDocument"],
    xls: ["Workbook", "Book"],
    ppt: ["PowerPoint Document"],
  }[ext];
  if (!want) return false;
  for (let p = 0; p + 128 <= dir.length; p += 128) {
    const len = Math.min(dir.readUInt16LE(p + 64), 64);
    const name = dir.subarray(p, p + Math.max(0, len - 2)).toString("utf16le");
    if (want.includes(name)) return true;
  }
  return false;
}

/** ODF: first entry must be the stored `mimetype` file naming this type. */
function odf(h: Buffer, mime: string) {
  if (!isZip(h) || ascii(h, 30, 38) !== "mimetype") return false;
  const start = 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  return ascii(h, start, start + mime.length) === mime;
}

const MARKUP_TAGS = [
  "!doctype html",
  "!doctype svg",
  "html",
  "head",
  "body",
  "script",
  "svg",
  "iframe",
];

/**
 * Leading HTML/SVG markup (after whitespace, XML prologs and comments):
 * refused even as .txt/.xml, so nothing renameable to .html gets stored.
 * Linear on purpose (no backtracking regex): every loop step moves `i`
 * forward, and `s` is at most the 64 KB head.
 */
export function leadingMarkup(s: string): boolean {
  let i = 0;
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s.startsWith("<!--", i)) {
      // Match the HTML tokenizer, not a naive "-->" search: "<!-->" and
      // "<!--->" are complete comments and "--!>" also closes one.
      if (s.startsWith(">", i + 4)) {
        i += 5;
        continue;
      }
      if (s.startsWith("->", i + 4)) {
        i += 6;
        continue;
      }
      // One forward scan over "--" (two indexOf searches per comment would
      // rescan the tail each time: quadratic on a run of comments).
      let j = i + 4;
      for (;;) {
        j = s.indexOf("--", j);
        // Unterminated comment: refuse rather than guess what follows.
        if (j < 0) return true;
        if (s[j + 2] === ">") {
          i = j + 3;
          break;
        }
        if (s.startsWith("!>", j + 2)) {
          i = j + 4;
          break;
        }
        j++;
      }
      continue;
    }
    if (s.startsWith("<?xml", i)) {
      const end = s.indexOf("?>", i + 5);
      if (end < 0) return true;
      i = end + 2;
      continue;
    }
    break;
  }
  const rest = s
    .slice(i, i + 40)
    .toLowerCase()
    .replace(/\s+/g, " ");
  return MARKUP_TAGS.some((t) => {
    const next = rest[t.length + 1];
    return (
      rest.startsWith(`<${t}`) &&
      (next === undefined || next === " " || next === ">" || next === "/")
    );
  });
}

function text(h: Buffer) {
  if (h.includes(0)) return false;
  try {
    // stream: a multi-byte char cut at the 64 KB boundary isn't an error.
    const s = new TextDecoder("utf-8", { fatal: true }).decode(h, {
      stream: true,
    });
    return !leadingMarkup(s.replace(/^\uFEFF/, ""));
  } catch {
    return false;
  }
}

/**
 * True when the object's real bytes are the type its extension claims.
 * Always called on the server-only FINAL copy (see promoteUpload).
 */
export async function sniff(
  read: Reader,
  size: number,
  type: FileType,
  ext: string,
): Promise<boolean> {
  try {
    return await check(read, size, type, ext);
  } catch {
    return false; // malformed offsets, short reads, etc.: just not this type
  }
}

async function check(
  read: Reader,
  size: number,
  type: FileType,
  ext: string,
): Promise<boolean> {
  const h = await read(0, Math.min(size, HEAD));
  const checks: Record<Check, () => boolean | Promise<boolean>> = {
    png: () => h[0] === 0x89 && ascii(h, 1, 4) === "PNG",
    jpeg: () => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
    gif: () => ascii(h, 0, 4) === "GIF8",
    webp: () => ascii(h, 0, 4) === "RIFF" && ascii(h, 8, 12) === "WEBP",
    pdf: () => ascii(h, 0, 5) === "%PDF-",
    docx: () => ooxml(read, size, h, "word/"),
    xlsx: () => ooxml(read, size, h, "xl/"),
    pptx: () => ooxml(read, size, h, "ppt/"),
    ole: () => h.length >= 512 && ole(read, size, h, ext),
    odf: () => odf(h, type.mime),
    text: () => text(h),
  };
  return checks[type.check]();
}
