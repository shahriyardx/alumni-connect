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
async function ole(read: Reader, h: Buffer, ext: string) {
  if (h.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") return false;
  const shift = h.readUInt16LE(30);
  if (shift !== 9 && shift !== 12) return false;
  const sector = 1 << shift;
  const dirSect = h.readUInt32LE(48);
  // ponytail: only the first directory sector is checked; Office always puts its main stream there.
  const dir = await read((dirSect + 1) * sector, sector);
  const want = {
    doc: ["WordDocument"],
    xls: ["Workbook", "Book"],
    ppt: ["PowerPoint Document"],
  }[ext];
  if (!want) return false;
  for (let p = 0; p + 128 <= dir.length; p += 128) {
    const len = dir.readUInt16LE(p + 64);
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

// Leading HTML/SVG markup (after an optional XML prolog/comments): refused
// even as .txt/.xml, so nothing renameable to .html ever gets stored.
const MARKUP =
  /^(?:\s|<\?xml[^>]*>|<!--[\s\S]*?-->)*<(?:!doctype\s+(?:html|svg)|html|head|body|script|svg|iframe)[\s>/]/i;

function text(h: Buffer) {
  if (h.includes(0)) return false;
  try {
    // stream: a multi-byte char cut at the 64 KB boundary isn't an error.
    const s = new TextDecoder("utf-8", { fatal: true }).decode(h, {
      stream: true,
    });
    return !MARKUP.test(s.replace(/^﻿/, ""));
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
    ole: () => h.length >= 512 && ole(read, h, ext),
    odf: () => odf(h, type.mime),
    text: () => text(h),
  };
  return checks[type.check]();
}
