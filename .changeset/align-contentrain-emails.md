---
"@contentrain/mcp": patch
"@contentrain/rules": patch
"@contentrain/skills": patch
---

Align all email addresses to real Contentrain mailboxes

The repo referenced a number of invented `@contentrain.io` addresses that don't have a real inbox. Only four mailboxes actually exist — `support@`, `info@`, `security@`, `ai@` — and every address now maps onto them.

- **`@contentrain/mcp`**: the default git commit-author email is now `ai@contentrain.io` (was `mcp@contentrain.io`) across the local/GitHub/GitLab provider defaults, the worktree transaction flow, and `commit-plan`. Override still honored via `CONTENTRAIN_AUTHOR_EMAIL`. Commits authored by the MCP write path will show the new address.
- **`@contentrain/rules` / `@contentrain/skills`**: the `approved_by` example in the workflow docs now uses `info@contentrain.io` instead of a personal address.

Repo-level contact/automation references were aligned too (CLA/Code-of-Conduct contact → `info@`, CI commit identity → `ai@`), but those don't affect published package behavior.
