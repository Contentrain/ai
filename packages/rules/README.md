# `@contentrain/rules`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Frules?label=%40contentrain%2Frules)](https://www.npmjs.com/package/@contentrain/rules)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/rules)

Shared AI-agent rules for Contentrain.

This package is the policy layer of the Contentrain ecosystem. It defines how agents should behave when they work with:

- Contentrain MCP tools
- schema and model design
- content quality
- normalize workflows
- git-backed review flows

If `@contentrain/mcp` is the deterministic execution layer, `@contentrain/rules` is the behavioral contract.

## Install

```bash
pnpm add @contentrain/rules
```

## What It Contains

### Essential guardrails

Published under `essential/*`:

- `contentrain-essentials.md` — compact, always-loaded rules (~86 lines) covering architecture, model kinds, MCP tools, mandatory protocols, and security basics

### Prompt layers

Published under `prompts/*`:

- `common.md`
- `generate-mode.md`
- `normalize-mode.md`
- `review-mode.md`

### Context bridge

Published under `context/*`:

- `context-bridge.md`

## Public Exports

The package root exports constants that can be used by tooling:

- `FIELD_TYPES` — 27 flat field types
- `MODEL_KINDS` — singleton, collection, document, dictionary
- `MCP_TOOLS` — 15 MCP tool names
- `ESSENTIAL_RULES_FILE` — path to essential guardrails markdown
- `STACKS` — supported framework stacks

## Example

```ts
import { MCP_TOOLS, ESSENTIAL_RULES_FILE, FIELD_TYPES } from '@contentrain/rules'

console.log(MCP_TOOLS.includes('contentrain_validate'))
console.log(ESSENTIAL_RULES_FILE) // 'essential/contentrain-essentials.md'
console.log(FIELD_TYPES.length)   // 27
```

## Design Role

`@contentrain/rules` exists to keep agent behavior aligned across tools and environments.

It should answer questions like:

- What is acceptable content quality?
- How should an agent use MCP tools?
- What is the normalize contract?
- What workflow and review constraints exist?

Detailed reference material and step-by-step procedures live in `@contentrain/skills` (Agent Skills standard format).

## Relationship To Other Packages

- `@contentrain/mcp` enforces file, validation, and git behavior
- `@contentrain/skills` provides Agent Skills with progressive disclosure (SKILL.md + references/)
- `contentrain` exposes CLI and serve UX
- `@contentrain/query` is the generated runtime consumption layer

Rule of thumb:

- `rules` = essential guardrails (always loaded, ~86 lines)
- `skills` = detailed procedures and reference docs (on-demand)

## Build

From the monorepo root:

```bash
pnpm --filter @contentrain/rules build
pnpm --filter @contentrain/rules test
pnpm --filter @contentrain/rules typecheck
```

## License

MIT
