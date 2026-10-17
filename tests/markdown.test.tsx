import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/markdown";
import { asFence } from "@/lib/highlight";

test("a ```python fence renders highlighted spans, a label and a copy button; raw HTML stays text", () => {
  const html = renderToStaticMarkup(
    <Markdown>
      {
        "```python\ndef f(x):\n    return 'hi'  # note\n```\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>"
      }
    </Markdown>,
  );
  expect(html).toContain("hljs language-python");
  expect(html).toContain('<span class="hljs-keyword">def</span>');
  expect(html).toContain('<span class="hljs-string">&#x27;hi&#x27;</span>');
  expect(html).toContain('<span class="hljs-comment"># note</span>');
  expect(html).toContain(">python</span>");
  expect(html).toContain('aria-label="Copy code"');
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;script&gt;");
});

test("unknown fence languages render as plain code instead of throwing", () => {
  const html = renderToStaticMarkup(
    <Markdown>{"```brainfuck\n+++\n```"}</Markdown>,
  );
  expect(html).toContain("+++");
});

test("asFence keeps file content inside one fence, even with backticks", () => {
  const body = "a\n```\n<b>x</b>\n````\nz";
  const html = renderToStaticMarkup(
    <Markdown>{asFence(body, "text")}</Markdown>,
  );
  expect(html.match(/<pre/g)).toHaveLength(1);
  expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  expect(html).toContain("````");
});
