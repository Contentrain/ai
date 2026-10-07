---
"@contentrain/types": patch
"@contentrain/mcp": patch
---

A document saved with unreadable frontmatter lines keeps its ending: a file with no final newline comes back without one (it used to gain `\n`). `writeContent` (scaffold and normalize extract) now announces, like `content_save`, when a saved value replaces a block it could not read.
