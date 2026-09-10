---
"@contentrain/types": patch
"@contentrain/mcp": patch
---

`PATH_PATTERNS.content.document` names the model it always required

The published constant said documents live at
`.contentrain/content/{domain}/{slug}/{locale}.md`, while every resolver has
always put the model between the domain and the slug —
`content/{domain}/{modelId}/{slug}/{locale}.md`. The other three content
patterns already carried `{modelId}`, so the document line was the odd one
out. Nothing reads `PATH_PATTERNS`, which is exactly why it could drift: an
implementer following it would have written documents to a path Contentrain
does not read.

The pattern is corrected, `noLocaleDocument` covers the `i18n: false` document
(`{slug}.md`), and the block now says what it leaves out: these show the
default `locale_strategy: 'file'`, `content_path` replaces the prefix, and
meta always carries a locale because a non-i18n model pins it to the project
default.

A parity test in `@contentrain/mcp` fills the placeholders and compares
against `resolveContentDir` / `resolveJsonFilePath` / `resolveMdFilePath`, so
the constant can no longer drift silently.
