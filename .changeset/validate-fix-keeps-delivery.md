---
"@contentrain/mcp": patch
"@contentrain/rules": patch
"@contentrain/skills": patch
---

`contentrain_validate fix:true` no longer unpublishes content. Meta it backfills for an entry without meta is `status: published`, which is what delivery already serves for such entries; it used to write `draft`, silently dropping them from public builds. Every entry whose delivery a fix changes is now listed in `visibility_changes`, and a fix that changes one is left on its `cr/fix/validate/…` branch for review instead of auto-merged.
