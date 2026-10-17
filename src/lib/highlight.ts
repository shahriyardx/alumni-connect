import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import matlab from "highlight.js/lib/languages/matlab";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * The one highlighter config: Markdown fences (rehype-highlight) and file
 * previews (rendered as a fence through the same Markdown) both use it.
 */
export const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  matlab,
  php,
  python,
  r,
  ruby,
  rust,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

/** File extension → fence language (unlisted extensions stay plain text). */
const EXT_LANG: Record<string, string> = {
  py: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  java: "java",
  kt: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cc: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  swift: "swift",
  r: "r",
  m: "matlab",
  sql: "sql",
  sh: "bash",
  json: "json",
  ipynb: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  md: "markdown",
};

export const langForExt = (ext: string) => EXT_LANG[ext] ?? "text";

/** `text` as one fenced block, with a fence longer than any backtick run inside. */
export function asFence(text: string, lang: string): string {
  const longest = (text.match(/`+/g) ?? []).reduce(
    (n, m) => Math.max(n, m.length),
    0,
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${text.replace(/\n$/, "")}\n${fence}`;
}
