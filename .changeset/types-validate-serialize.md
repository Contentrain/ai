---
"@contentrain/types": minor
---

Add pure, dependency-free validate and serialize functions for shared use across MCP (Node.js) and Studio (web).

**Validate:** `validateSlug`, `validateEntryId`, `validateLocale`, `detectSecrets`, `validateFieldValue` (type, required, min/max, pattern, select options).

**Serialize:** `sortKeys`, `canonicalStringify`, `generateEntryId`, `parseMarkdownFrontmatter`, `serializeMarkdownFrontmatter`.

All functions are browser-compatible with zero runtime dependencies.
