/** Shared between the server (storage.ts, sniff.ts) and the client (uploaders) — no env/node imports here. */
export const ALLOWED_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_DOC_BYTES = 20 * 1024 * 1024;
/** Per post or comment. */
export const MAX_ATTACHMENTS = 5;
/** Text/code attachments at or under this get an inline preview. */
export const PREVIEW_BYTES = 200 * 1024;

/** How the server validates the bytes (see src/server/sniff.ts). */
export type Check =
  | "png"
  | "jpeg"
  | "webp"
  | "gif"
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "ole"
  | "odf"
  | "text";
export type FileIcon =
  | "image"
  | "pdf"
  | "doc"
  | "sheet"
  | "slides"
  | "text"
  | "code";
export type FileType = { mime: string; check: Check; icon: FileIcon };

const TEXT = "text/plain; charset=utf-8";
const OOXML = "application/vnd.openxmlformats-officedocument";
const ODF = "application/vnd.oasis.opendocument";

// Code is stored/served as text/plain (never its "real" JS/XML/HTML type):
// text/plain + nosniff is what keeps it from executing. html/htm/svg are
// deliberately absent, as are archives and executables.
const CODE_EXTS =
  "py js mjs cjs ts tsx jsx java kt c h cpp hpp cc cs go rs rb php swift scala r m sql sh ps1 lua dart hs ml ex exs json yaml yml toml xml ini ipynb tex".split(
    " ",
  );

/** Keyed by lowercase extension; the extension decides the expected type. */
export const FILE_TYPES: Record<string, FileType> = {
  png: { mime: "image/png", check: "png", icon: "image" },
  jpg: { mime: "image/jpeg", check: "jpeg", icon: "image" },
  jpeg: { mime: "image/jpeg", check: "jpeg", icon: "image" },
  webp: { mime: "image/webp", check: "webp", icon: "image" },
  gif: { mime: "image/gif", check: "gif", icon: "image" },
  pdf: { mime: "application/pdf", check: "pdf", icon: "pdf" },
  docx: {
    mime: `${OOXML}.wordprocessingml.document`,
    check: "docx",
    icon: "doc",
  },
  xlsx: { mime: `${OOXML}.spreadsheetml.sheet`, check: "xlsx", icon: "sheet" },
  pptx: {
    mime: `${OOXML}.presentationml.presentation`,
    check: "pptx",
    icon: "slides",
  },
  doc: { mime: "application/msword", check: "ole", icon: "doc" },
  xls: { mime: "application/vnd.ms-excel", check: "ole", icon: "sheet" },
  ppt: { mime: "application/vnd.ms-powerpoint", check: "ole", icon: "slides" },
  odt: { mime: `${ODF}.text`, check: "odf", icon: "doc" },
  ods: { mime: `${ODF}.spreadsheet`, check: "odf", icon: "sheet" },
  odp: { mime: `${ODF}.presentation`, check: "odf", icon: "slides" },
  txt: { mime: TEXT, check: "text", icon: "text" },
  md: { mime: "text/markdown; charset=utf-8", check: "text", icon: "text" },
  csv: { mime: "text/csv; charset=utf-8", check: "text", icon: "sheet" },
  ...Object.fromEntries(
    CODE_EXTS.map((e) => [e, { mime: TEXT, check: "text", icon: "code" }]),
  ),
};

export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif"];
export const ALL_EXTS = Object.keys(FILE_TYPES);

export const isImageType = (t: FileType) => t.icon === "image";
export const maxBytesFor = (t: FileType) =>
  isImageType(t)
    ? MAX_BYTES
    : t.check === "text"
      ? MAX_TEXT_BYTES
      : MAX_DOC_BYTES;

/** Lowercase extension of a file name ("" when there is none). */
export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

/**
 * Display/download name: no path parts or control chars, ≤120 chars, and
 * always ending in an extension of the stored type (so "x.html" can't ride a .txt).
 */
export function sanitizeFilename(raw: string | undefined, ext: string): string {
  const base = (raw ?? "")
    .split(/[/\\]/)
    .pop()
    ?.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
      /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .trim()
    .replace(/^\.+/, "");
  let name = base || `file.${ext}`;
  if (FILE_TYPES[extOf(name)]?.mime !== FILE_TYPES[ext]?.mime)
    name = `${name}.${ext}`;
  if (name.length > 120) name = `${name.slice(0, 119 - ext.length)}.${ext}`;
  return name;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
