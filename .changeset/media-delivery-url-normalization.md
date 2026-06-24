---
"@contentrain/types": minor
"@contentrain/mcp": minor
"@contentrain/query": minor
"contentrain": minor
"@contentrain/rules": patch
"@contentrain/skills": patch
---

feat(mcp): normalize media paths to absolute delivery URLs on cloud writes

External-agent writes through MCP Cloud go straight through `planContentSave`
rather than Studio's content-engine, so relative `media/...` references used to
land in git verbatim. They now resolve the same way Studio's own write path
resolves them.

- **@contentrain/types**: `RepoProvider` gains optional `mediaBaseUrl` (the
  per-project public delivery base, project segment included) and
  `ContentrainConfig` gains optional `cdn.url`.
- **@contentrain/mcp**: when the provider supplies `mediaBaseUrl` (cloud mode),
  `contentrain_content_save` normalizes relative `media/...` references — in
  image/video/file fields (incl. nested object/array) and markdown bodies — to
  absolute `{base}/{path}` delivery URLs before commit. Idempotent: external
  URLs (`http(s)://`, `//`, `data:`) and already-absolute URLs pass through. In
  local mode (no base) paths are kept verbatim — the OSS file model.
- **@contentrain/query**: `generate` accepts `cdnBaseUrl` (or reads
  `config.cdn.url`) and bakes a `media()` resolver into the generated local
  client — `media('media/...') → {base}/{path}` — the local-mode counterpart of
  CDN mode's `MediaAccessor.url()`.
- **contentrain (CLI)**: `generate --cdnBaseUrl <base>` flag.
- **@contentrain/rules, @contentrain/skills**: document the two media storage
  models (local-file vs Studio-CDN) and the `media()` resolver.
