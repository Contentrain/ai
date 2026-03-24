# @contentrain/query

## 5.1.0

### Minor Changes

- 2bf3f65: feat(sdk): add CDN transport for remote content delivery

  New `createContentrain()` factory for async HTTP-based content access from Contentrain Studio CDN.

  - New `./cdn` subpath export with `HttpTransport`, async query classes
  - `ContentrainError` class for HTTP error handling (401, 403, 404, 429)
  - ETag-based HTTP caching for efficient CDN fetching
  - Extended `where()` operators: eq, ne, gt, gte, lt, lte, in, contains
  - Metadata endpoints: `manifest()`, `models()`, `model(id)`
  - Zero breaking changes — existing sync local mode is unaffected

## 5.0.2

### Patch Changes

- Updated dependencies
  - @contentrain/types@0.2.0

## 5.0.1

### Patch Changes

- 84eb1c2: feat(rules): add granular IDE rule files for Claude Code, Cursor, and Windsurf

  Generated individual rule files per shared rule in ide/claude-code/rules/, ide/cursor/rules/ (.mdc with alwaysApply frontmatter), and ide/windsurf/rules/ (.md with trigger: always_on frontmatter).

  feat(cli): redesign installRules() to distribute granular rules to .claude/rules/, .cursor/rules/, .windsurf/rules/

  For Claude Code: install 11 granular rule files to .claude/rules/, workflow skills to .claude/skills/ from @contentrain/skills, and add a lightweight reference to CLAUDE.md instead of the previous 2984-line monolithic bundle.

  For Cursor: install .mdc files to .cursor/rules/ when .cursor/ directory detected; fall back to monolithic .cursorrules otherwise.

  For Windsurf: install individual .md files to .windsurf/rules/ when .windsurf/ directory detected.

  fix(sdk): fix race condition in generate.test.ts that caused intermittent test failures when test files ran concurrently
