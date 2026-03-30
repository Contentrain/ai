# `@contentrain/skills`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Fskills?label=%40contentrain%2Fskills)](https://www.npmjs.com/package/@contentrain/skills)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/skills)
[![Docs](https://img.shields.io/badge/docs-ai.contentrain.io-0f172a)](https://ai.contentrain.io/packages/rules)

Workflow skills and framework guides for Contentrain-aware AI agents.

Start here:

- [2-minute product demo](https://ai.contentrain.io/demo)
- [Rules & skills docs](https://ai.contentrain.io/packages/rules)
- [Framework integration guide](https://ai.contentrain.io/guides/frameworks)

This package follows the [Agent Skills standard](https://agentskills.io) for progressive disclosure: each skill has a `SKILL.md` (loaded on activation) and optional `references/` (loaded on demand).

## Install

```bash
pnpm add @contentrain/skills
```

Or install directly via the skills CLI:

```bash
npx skills add contentrain/contentrain-ai --skill='*'
```

## What It Contains

### Agent Skills (standard format)

Published under `skills/`:

| Skill | Description |
|-------|-------------|
| `contentrain` | Core architecture, MCP tools, content formats |
| `contentrain-normalize` | Two-phase normalize (extract + reuse) |
| `contentrain-quality` | Content quality, SEO, accessibility, media |
| `contentrain-sdk` | @contentrain/query SDK usage (local + CDN) |
| `contentrain-content` | Content CRUD operations |
| `contentrain-model` | Model creation/update |
| `contentrain-init` | Project initialization |
| `contentrain-bulk` | Batch operations |
| `contentrain-validate-fix` | Validation and auto-fix |
| `contentrain-review` | Content quality review |
| `contentrain-translate` | Multi-locale translation |
| `contentrain-generate` | SDK client generation |
| `contentrain-serve` | Local review/normalize UI |
| `contentrain-diff` | Branch content diffs |
| `contentrain-doctor` | Project health diagnostics |

Each skill directory contains:
```
skills/{name}/
├── SKILL.md           # Instructions (< 500 lines)
└── references/        # Detailed docs (loaded on demand)
    └── *.md
```

### Workflow skills (backward compat)

Published under `workflows/*` — flat markdown files from previous versions. Still functional.

### Framework guides

Published under `frameworks/*`:

- `nuxt.md`, `next.md`, `astro.md`, `sveltekit.md`, `vue.md`, `react.md`, `expo.md`, `react-native.md`, `node.md`

## Public Exports

```ts
import { AGENT_SKILLS, WORKFLOW_SKILLS, FRAMEWORK_GUIDES } from '@contentrain/skills'

// Agent Skills catalog (name + description for Tier 1 discovery)
console.log(AGENT_SKILLS)

// Backward compat
console.log(WORKFLOW_SKILLS)
console.log(FRAMEWORK_GUIDES)
```

## Progressive Disclosure

| Tier | What's Loaded | When | Token Cost |
|------|--------------|------|------------|
| 1. Catalog | `name` + `description` | Session start | ~50 tokens/skill |
| 2. Instructions | Full `SKILL.md` body | Skill activated | < 5000 tokens |
| 3. References | `references/*.md` | Agent needs detail | Varies |

This reduces always-loaded context from ~4,700 lines to ~86 lines (essential guardrails only).

## IDE Support

Skills are installed by `contentrain init` for detected IDEs:

| IDE | Rules Dir | Skills Dir |
|-----|-----------|------------|
| Claude Code | `.claude/rules/` | `.claude/skills/` |
| Cursor | `.cursor/rules/` | `.cursor/skills/` |
| Windsurf | `.windsurf/rules/` | `.windsurf/skills/` |
| GitHub Copilot | `.github/` | `.agents/skills/` |

## Build

From the monorepo root:

```bash
pnpm --filter @contentrain/skills build
pnpm --filter @contentrain/skills test
pnpm --filter @contentrain/skills typecheck
```

## License

MIT
