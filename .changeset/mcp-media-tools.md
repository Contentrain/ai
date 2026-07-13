---
"@contentrain/types": minor
"@contentrain/mcp": minor
"@contentrain/rules": minor
"@contentrain/skills": minor
---

feat(mcp): media tools over an optional provider media facet

**@contentrain/types**: new `MediaProvider` contract (`list`/`get`/`ingest`/`update`/`delete`) plus `MediaAsset`, `MediaListOptions`, `MediaListResult`, `MediaIngestInput`, `MediaUpdateInput`. `RepoProvider` gains an optional `media?: MediaProvider` facet — implemented by hosted providers (Studio MCP Cloud), absent on Local/GitHub/GitLab.

**@contentrain/mcp**: five new tools — `contentrain_media_list`, `contentrain_media_get`, `contentrain_media_ingest`, `contentrain_media_update`, `contentrain_media_delete` — as a deterministic passthrough to the provider's media facet.

- **Capability-aware:** registered only when `RepoProvider.media` is present (new `media` requirement in `TOOL_REQUIREMENTS`). Local stdio servers keep listing exactly the 19 core tools; nothing changes for existing embeddings.
- **URL-based ingest.** MCP has no binary channel; the provider fetches the source URL server-side and owns SSRF/MIME/size policy. `contentrain_media_ingest` is the only tool with `openWorldHint: true`.
- **Safety:** `media_delete` is `destructiveHint: true` and requires `confirm: true`; content references are never rewritten by MCP.
- Closes the discovery loop for external agents: list assets → pick a `media/...` path → reference it via `contentrain_content_save` (absolute delivery URLs via `mediaBaseUrl`).

**@contentrain/rules**: `MCP_TOOLS` now lists 24 tools (19 core + 5 media); essential guardrails document the media flow.

**@contentrain/skills**: `references/mcp-tools.md` gains a Media Tools section covering all five tools (parity-tested against the MCP registry).
