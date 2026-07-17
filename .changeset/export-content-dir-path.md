---
"@contentrain/mcp": minor
---

feat(mcp): export `contentDirPath` from `@contentrain/mcp/core/ops`

The helper already existed in `core/ops/paths.ts` (and backs `contentFilePath`
/ `documentFilePath`), but the subpath barrel only re-exported the file-level
helpers. Exposing the directory-level resolver lets consumers (e.g. Studio)
resolve a model's content directory through the same `content_path`-aware logic
instead of maintaining a local copy.
