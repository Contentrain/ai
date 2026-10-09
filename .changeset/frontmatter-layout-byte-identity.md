---
"@contentrain/types": patch
---

A document saved without a field change is byte-identical again (#521). `parseMarkdownFrontmatter` now records the layout around the body — the blank lines after the closing `---`, the trailing newlines, the line ending and the final newline — whenever it differs from the default shape, and `serializeMarkdownFrontmatter` writes it back: no blank line is added after `---` or collapsed, `\n\n` at the end stays `\n\n`, a plain document without a final newline keeps none, and a plain CRLF document stays CRLF. A document in the default shape (LF, one blank line after `---`, one final newline) still has no `preserved`, and new documents are written as before.
