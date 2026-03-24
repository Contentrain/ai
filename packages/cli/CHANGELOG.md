# contentrain

## 0.3.0

### Minor Changes

- 2bf3f65: feat(rules,skills,cli): migrate to Agent Skills standard format

  **@contentrain/rules:**

  - Add `essential/contentrain-essentials.md` — compact always-loaded guardrails (~86 lines)
  - Remove `ide/` directory and `scripts/build-rules.ts` (IDE-specific build system)
  - Replace `ALL_SHARED_RULES`, `IDE_RULE_FILES` exports with `ESSENTIAL_RULES_FILE`
  - Always-loaded context reduced from 2,945 lines to 86 lines (97% reduction)

  **@contentrain/skills:**

  - Add `skills/` directory with 15 Agent Skills (SKILL.md + references/) following agentskills.io standard
  - Add `AGENT_SKILLS` catalog export for Tier 1 discovery (name + description)
  - New `contentrain-sdk` skill for @contentrain/query usage (local + CDN)
  - Existing `workflows/` and `frameworks/` kept for backward compatibility

  **contentrain (CLI):**

  - Rewrite `installRules()` with generic IDE installer supporting Claude Code, Cursor, Windsurf, and GitHub Copilot
  - Install one compact essential guardrails file per IDE (always-loaded) + Agent Skills directories (on-demand)
  - Automatic cleanup of old granular rule files from previous versions

### Patch Changes

- Updated dependencies [2bf3f65]
- Updated dependencies [2bf3f65]
  - @contentrain/rules@0.3.0
  - @contentrain/query@5.1.0

## 0.2.3

### Patch Changes

- Updated dependencies
  - @contentrain/mcp@1.0.6

## 0.2.2

### Patch Changes

- Updated dependencies
  - @contentrain/mcp@1.0.5

## 0.2.1

### Patch Changes

- feat(types): complete content architecture types — DocumentEntry, ModelSummary, path constants, validation patterns

  Internal packages updated to use centralized types from @contentrain/types.

- Updated dependencies
  - @contentrain/types@0.2.0
  - @contentrain/mcp@1.0.4
  - @contentrain/query@5.0.2

## 0.2.0

### Minor Changes

- 84eb1c2: feat(rules): add granular IDE rule files for Claude Code, Cursor, and Windsurf

  Generated individual rule files per shared rule in ide/claude-code/rules/, ide/cursor/rules/ (.mdc with alwaysApply frontmatter), and ide/windsurf/rules/ (.md with trigger: always_on frontmatter).

  feat(cli): redesign installRules() to distribute granular rules to .claude/rules/, .cursor/rules/, .windsurf/rules/

  For Claude Code: install 11 granular rule files to .claude/rules/, workflow skills to .claude/skills/ from @contentrain/skills, and add a lightweight reference to CLAUDE.md instead of the previous 2984-line monolithic bundle.

  For Cursor: install .mdc files to .cursor/rules/ when .cursor/ directory detected; fall back to monolithic .cursorrules otherwise.

  For Windsurf: install individual .md files to .windsurf/rules/ when .windsurf/ directory detected.

  fix(sdk): fix race condition in generate.test.ts that caused intermittent test failures when test files ran concurrently

### Patch Changes

- Updated dependencies [84eb1c2]
  - @contentrain/rules@0.2.0
  - @contentrain/query@5.0.1

## 0.1.4

### Patch Changes

- Add Docs and GitHub external links to serve UI sidebar.

## 0.1.3

### Patch Changes

- Fix CI pipeline: add build step before tests, configure git identity, add serve-ui to workspace, fix apply-guardrails tests.
- Updated dependencies
  - @contentrain/mcp@1.0.3

## 0.1.2

### Patch Changes

- Fix markdown document listing in serve UI: flatten frontmatter fields into table columns, include body content, and render markdown with marked + Tailwind Typography.
- Updated dependencies
  - @contentrain/mcp@1.0.2

## 0.1.1

### Patch Changes

- Updated dependencies
  - @contentrain/mcp@1.0.1
