# @contentrain/mcp

## 1.1.0

### Minor Changes

- fe97f7b: Rewrite git transaction system with dedicated `contentrain` branch and full worktree isolation.

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

### Patch Changes

- Updated dependencies [fe97f7b]
  - @contentrain/types@0.3.0

## 1.0.7

### Patch Changes

- 2feb3b8: fix(mcp): auto-stash dirty working tree during auto-merge

  MCP's auto-merge flow no longer blocks when developers have staged or unstaged changes. Working tree is automatically stashed before checkout + merge, then restored after completion.

## 1.0.6

### Patch Changes

- fix(mcp): correct mcpName casing for MCP Registry (Contentrain, not contentrain)

## 1.0.5

### Patch Changes

- chore(mcp): add mcpName for MCP Registry listing

## 1.0.4

### Patch Changes

- feat(types): complete content architecture types — DocumentEntry, ModelSummary, path constants, validation patterns

  Internal packages updated to use centralized types from @contentrain/types.

- Updated dependencies
  - @contentrain/types@0.2.0

## 1.0.3

### Patch Changes

- Fix CI pipeline: add build step before tests, configure git identity, add serve-ui to workspace, fix apply-guardrails tests.

## 1.0.2

### Patch Changes

- Fix markdown document listing in serve UI: flatten frontmatter fields into table columns, include body content, and render markdown with marked + Tailwind Typography.

## 1.0.1

### Patch Changes

- Fix frontmatter serialization for nested objects, arrays, and YAML-sensitive scalar values in the MCP content manager.
