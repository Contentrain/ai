---
"@contentrain/mcp": patch
---

Refactor validation and serialization to use shared functions from `@contentrain/types` instead of local duplicates. Removes ~530 lines of duplicated code (pattern constants, field type matching, secret detection, frontmatter parsing, canonical JSON). No public API changes — all existing exports remain backward-compatible via re-exports.
