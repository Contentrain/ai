---
"@contentrain/mcp": minor
"@contentrain/types": minor
"contentrain": patch
"@contentrain/rules": patch
"@contentrain/skills": patch
---

Rewrite git transaction system with dedicated `contentrain` branch and full worktree isolation.

**@contentrain/mcp:**
- Eliminate stash/checkout/merge on developer's working tree during auto-merge
- All git operations happen in temporary worktrees — developer's tree never mutated
- Dedicated `contentrain` branch as content state single source of truth
- Feature branches use `cr/` prefix (avoids git ref namespace collision)
- Auto-merge flow: feature → contentrain → update-ref baseBranch (fast-forward)
- Selective sync: only changed files copied to working tree, dirty files skipped with warning
- context.json committed with content (not separately)
- Structured errors with code, message, agent_hint, developer_action
- Automatic migration of old `contentrain/*` branches on first operation

**@contentrain/types:**
- Add `SyncResult` interface for selective file sync results
- Add `ContentrainError` interface for structured error reporting
- Add `CONTENTRAIN_BRANCH` constant

**contentrain (CLI):**
- Worktree merge pattern in diff, serve approve, normalize approve
- Contentrain branch status display in `contentrain status`
- Protected contentrain branch in branch listings

**@contentrain/rules & @contentrain/skills:**
- Updated workflow documentation for new git architecture
