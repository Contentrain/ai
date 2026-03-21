# @contentrain/mcp

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
