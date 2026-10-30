---
"@contentrain/types": patch
"@contentrain/mcp": patch
---

`context.json` keeps its project intelligence across writes. MCP regenerated the file from scratch after every write, so `project`, `content`, `normalize` and `conventions` (the fields `context-bridge.md` tells agents to prefer over rule defaults) were deleted on the first merge. `writeContext` and `buildContextChange` now update only `version`, `lastOperation` and `stats` and keep every other key, including keys they do not know. A missing or unreadable file behaves as before.

`@contentrain/types` adds `mergeContextJson(previous, next)`, the rule both writers use, and types the optional `project` / `content` / `normalize` / `conventions` fields on `ContextJson`.
