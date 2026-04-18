# `@contentrain/rules`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Frules?label=%40contentrain%2Frules)](https://www.npmjs.com/package/@contentrain/rules)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-compatible-8B5CF6)](https://agentskills.io)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/rules)
[![Docs](https://img.shields.io/badge/docs-ai.contentrain.io-0f172a)](https://ai.contentrain.io/packages/rules)

Shared AI-agent rules for Contentrain.

Start here:

- [2-minute product demo](https://ai.contentrain.io/demo)
- [Rules &amp; skills docs](https://ai.contentrain.io/packages/rules)

This package is the **policy layer** of the Contentrain ecosystem. It defines how agents should behave when they work with:

- Contentrain MCP tools (17 operations)
- schema and model design
- content quality (SEO, accessibility, media, i18n)
- normalize workflows (extraction + reuse)
- git-backed review flows
- security guardrails

If `@contentrain/mcp` is the deterministic execution layer, `@contentrain/rules` is the behavioral contract.

## Install

```bash
pnpm add @contentrain/rules
```

## What It Contains

### Essential guardrails

Published under `essential/`:

- `contentrain-essentials.md` — compact, always-loaded rules covering architecture, model kinds, MCP tools, mandatory protocols, git workflow, and security basics.

### Shared quality rules

Published under `shared/` — detailed standards per domain:

- `content-quality.md` — structure, required fields, content completeness
- `seo-rules.md` — meta optimization, keywords, canonical URLs
- `accessibility-rules.md` — alt text, ARIA labels, color contrast
- `media-rules.md` — image optimization, responsive sizing, asset naming
- `schema-rules.md` — model design, field types, relations, inheritance
- `i18n-quality.md` — translation completeness, locale parity
- `security-rules.md` — sensitive data patterns, secret detection, XSS prevention
- `mcp-usage.md` — tool invocation patterns, git workflows, trust levels
- `normalize-rules.md` — extraction and reuse constraints, scope safety
- `workflow-rules.md` — review mode, approval flows, branch lifecycle
- `content-conventions.md` — naming, slug generation, status conventions

### Prompt layers

Published under `prompts/` — mode-specific context the agent loads per task:

- `common.md` — shared preamble for all agent modes
- `generate-mode.md` — content creation constraints
- `normalize-mode.md` — string extraction and patching workflows
- `review-mode.md` — content validation and change review

### Context bridge

Published under `context/`:

- `context-bridge.md` — how to integrate rules into agent context systems
- `templates/` — framework-specific context JSON for `nuxt`, `next`, `astro`, `sveltekit`

## Public Exports

The package root exports constants for tooling:

- `FIELD_TYPES` — 27 flat field types
- `MODEL_KINDS` — `singleton`, `collection`, `document`, `dictionary`
- `MCP_TOOLS` — 17 MCP tool names (includes `contentrain_merge` and `contentrain_doctor`)
- `ESSENTIAL_RULES_FILE` — path to essential guardrails markdown
- `STACKS` — supported framework stacks

## Quick Example

```ts
import { MCP_TOOLS, ESSENTIAL_RULES_FILE, FIELD_TYPES } from '@contentrain/rules'

console.log(MCP_TOOLS.length)                            // 17
console.log(MCP_TOOLS.includes('contentrain_merge'))     // true
console.log(MCP_TOOLS.includes('contentrain_doctor'))    // true
console.log(ESSENTIAL_RULES_FILE)                        // 'essential/contentrain-essentials.md'
console.log(FIELD_TYPES.length)                          // 27
```

## Design Role

`@contentrain/rules` exists to keep agent behavior aligned across tools and environments.

Typical questions it answers:

- What is acceptable content quality? (shared quality rules)
- How should an agent use MCP tools safely? (mcp-usage + tool reference)
- What is the normalize contract? (normalize-rules)
- What workflow and review constraints exist? (workflow-rules)

Detailed procedures and step-by-step guides live in `@contentrain/skills` (Agent Skills standard format).

## Parity with `@contentrain/mcp`

`@contentrain/rules` is kept in lockstep with the MCP tool registry via cross-package parity tests. When a new MCP tool is registered in `@contentrain/mcp`:

- `MCP_TOOLS` must include it (otherwise `tests/mcp-parity.test.ts` fails)
- the essentials document must mention it
- the skills reference must have a `### <tool>` section

When MCP's branch-naming convention changes (e.g. `contentrain/*` → `cr/*`), the rules prose must follow — the parity test scans the rules for the legacy prefix and fails if it reappears.

## Relationship To Other Packages

- `@contentrain/mcp` enforces file, validation, and git behavior
- `@contentrain/skills` provides Agent Skills with progressive disclosure (SKILL.md + references/)
- `contentrain` (CLI) installs rules + skills into the IDE during `contentrain init`
- `@contentrain/query` is the generated runtime consumption layer

Rule of thumb:

- `rules` = policy layer (quality standards, constraints, essentials)
- `skills` = procedural layer (workflows, detailed reference docs)

See [`AGENTS.md`](../../AGENTS.md) at the repo root for project-level agent guidance.

## Build

From the monorepo root:

```bash
pnpm --filter @contentrain/rules build
pnpm --filter @contentrain/rules test
pnpm --filter @contentrain/rules typecheck
```

## License

MIT
