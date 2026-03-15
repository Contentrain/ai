# `@contentrain/rules`

Shared AI-agent rules for Contentrain.

This package is the policy layer of the Contentrain ecosystem. It defines how agents should behave when they work with:

- Contentrain MCP tools
- schema and model design
- content quality
- normalize workflows
- git-backed review flows
- IDE rule distribution

If `@contentrain/mcp` is the deterministic execution layer, `@contentrain/rules` is the behavioral contract.

## Install

```bash
pnpm add @contentrain/rules
```

## What It Contains

### Shared rule sets

Published under `shared/*`:

- `content-quality.md`
- `seo-rules.md`
- `i18n-quality.md`
- `accessibility-rules.md`
- `security-rules.md`
- `media-rules.md`
- `content-conventions.md`
- `schema-rules.md`
- `mcp-usage.md`
- `workflow-rules.md`
- `normalize-rules.md`

### Prompt layers

Published under `prompts/*`:

- `common.md`
- `generate-mode.md`
- `normalize-mode.md`
- `review-mode.md`

### Context bridge

Published under `context/*`:

- `context-bridge.md`

### IDE bundles

Published under `ide/*`:

- `ide/claude-code/contentrain.md`
- `ide/cursor/contentrain.cursorrules`
- `ide/windsurf/contentrain.windsurfrules`
- `ide/generic/contentrain.md`

## Public Exports

The package root exports constants that can be used by tooling:

- `FIELD_TYPES`
- `MODEL_KINDS`
- `MCP_TOOLS`
- `CONTENT_QUALITY_RULES`
- `ARCHITECTURE_RULES`
- `ALL_SHARED_RULES`
- `IDE_RULE_FILES`
- `STACKS`

## Example

```ts
import { IDE_RULE_FILES, MCP_TOOLS, ALL_SHARED_RULES } from '@contentrain/rules'

console.log(MCP_TOOLS.includes('contentrain_validate'))
console.log(IDE_RULE_FILES['claude-code'])
console.log(ALL_SHARED_RULES)
```

## Design Role

`@contentrain/rules` exists to keep agent behavior aligned across tools and environments.

It should answer questions like:

- What is acceptable content quality?
- How should an agent use MCP tools?
- What is the normalize contract?
- What workflow and review constraints exist?
- How should rules be packaged for Claude Code, Cursor, Windsurf, and generic agents?

## Relationship To Other Packages

- `@contentrain/mcp` enforces file, validation, and git behavior
- `@contentrain/skills` provides step-by-step workflow playbooks
- `contentrain` exposes CLI and serve UX
- `@contentrain/query` is the generated runtime consumption layer

Rule of thumb:

- `rules` = policy and constraints
- `skills` = procedures and playbooks

## Build

The build does two things:

1. builds the typed JS entry from `src/index.ts`
2. generates IDE bundle files from the shared markdown rules

From the monorepo root:

```bash
pnpm --filter @contentrain/rules build
pnpm --filter @contentrain/rules test
pnpm --filter @contentrain/rules typecheck
```

## License

MIT
