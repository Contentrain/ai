---
"@contentrain/mcp": minor
"@contentrain/rules": patch
"@contentrain/skills": patch
---

New `contentrain_content_status` tool: publish, unpublish or archive entries on any session, local or remote.

Until now a remote session could create entries — always as drafts — and never publish them: the only status path was `contentrain_bulk update_status`, which needs a local worktree and is not listed remotely. `contentrain_content_status` goes through the provider like `contentrain_content_save`, so it works everywhere, and a remote provider commits it for review.

- Address records by meta layout: `entry_ids` for collections, `slugs` for documents, neither for singletons and dictionaries. `locale` scopes the change.
- Publishing validates the targeted entries first; an error in one of them means nothing is committed.
- A record already at the requested status is reported in `unchanged` and not rewritten, so a repeat commits nothing. The response lists `changes` (`from` → `to`), `unchanged` and `not_found`.
- Annotated destructive and idempotent.

`contentrain_content_list` now shows each entry's publish state under `meta` (`status`, plus `publish_at` / `expire_at` when set), read from the listed locale's meta. Local and remote return the same shape.

`contentrain_bulk` no longer has `update_status` — `contentrain_content_status` supersedes it — and is annotated destructive (`delete_entries` removes entries, `copy_locale` replaces the target locale). Its other operations and `dry_run` are unchanged, and it stays local-only.

A local server now lists 23 tools; a remote session lists 12 core tools, 17 with media.
