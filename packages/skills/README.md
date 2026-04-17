# `@contentrain/skills`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Fskills?label=%40contentrain%2Fskills)](https://www.npmjs.com/package/@contentrain/skills)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-15_skills-8B5CF6)](https://agentskills.io)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/skills)
[![Docs](https://img.shields.io/badge/docs-ai.contentrain.io-0f172a)](https://ai.contentrain.io/packages/skills)

Workflow skills and framework guides for Contentrain-aware AI agents.

Start here:

- [2-minute product demo](https://ai.contentrain.io/demo)
- [Rules &amp; skills docs](https://ai.contentrain.io/packages/rules)
- [Framework integration guide](https://ai.contentrain.io/guides/frameworks)

This package follows the [Agent Skills standard](https://agentskills.io) for **progressive disclosure**: each skill has a `SKILL.md` (loaded on activation) and optional `references/*.md` (loaded on demand).

## Install

### Via npm (programmatic access to catalogs and constants)

```bash
pnpm add @contentrain/skills
```

### Via skills CLI (install skills into your AI agent)

```bash
# Install all 15 skills
npx skills add Contentrain/ai/packages/skills

# Install a specific skill
npx skills add Contentrain/ai/packages/skills --skill contentrain-normalize

# Install to a specific agent
npx skills add Contentrain/ai/packages/skills --agent claude-code

# List available skills
npx skills add Contentrain/ai/packages/skills --list
```

Works with Claude Code, Cursor, Windsurf, GitHub Copilot, OpenAI Codex, Gemini CLI, and 40+ other agents.

## What It Contains

### Agent Skills (standard format)

Published under `skills/` — 15 production skills:

| Skill | Description |
|-------|-------------|
| `contentrain` | Core architecture, MCP tools, content formats, i18n, security |
| `contentrain-normalize` | Two-phase normalize (extract hardcoded strings + patch source files) |
| `contentrain-quality` | Content quality, SEO, accessibility, media optimization |
| `contentrain-sdk` | Query SDK usage (#contentrain imports, QueryBuilder, type-safe access) |
| `contentrain-content` | Create and manage content entries for existing models |
| `contentrain-model` | Design and save model definitions |
| `contentrain-init` | Initialize a new Contentrain project |
| `contentrain-bulk` | Batch operations on content entries |
| `contentrain-validate-fix` | Validate content and auto-fix structural issues |
| `contentrain-review` | Review content changes before publishing |
| `contentrain-translate` | Multi-locale translation workflows |
| `contentrain-generate` | Generate the typed SDK client from models |
| `contentrain-serve` | Start the local review and normalize UI |
| `contentrain-diff` | View content diffs between branches |
| `contentrain-doctor` | Diagnose project health issues |

Each skill directory contains:

```
skills/{name}/
├── SKILL.md           # Instructions (< 500 lines, quick reference)
└── references/        # Detailed docs (loaded on demand)
    └── *.md           # Deep dives: architecture, patterns, examples
```

Example references: `contentrain/references/mcp-tools.md`, `contentrain-normalize/references/extraction.md`, `contentrain-quality/references/seo.md`.

### Workflow skills (backward compat)

Published under `workflows/` — flat markdown files retained for compatibility:

- `contentrain-init.md`, `contentrain-model.md`, `contentrain-content.md`, `contentrain-bulk.md`
- `contentrain-normalize.md`, `contentrain-validate-fix.md`, `contentrain-review.md`
- `contentrain-diff.md`, `contentrain-doctor.md`, `contentrain-serve.md`
- `contentrain-generate.md`, `contentrain-translate.md`

Still fully functional; new projects should prefer the `skills/` structure.

### Framework guides

Published under `frameworks/` — per-framework integration patterns:

- `nuxt.md`, `next.md`, `astro.md`, `sveltekit.md` (meta frameworks)
- `react.md`, `vue.md` (UI libraries)
- `expo.md`, `react-native.md` (mobile)
- `node.md` (backend)

## Public Exports

```ts
import { AGENT_SKILLS, WORKFLOW_SKILLS, FRAMEWORK_GUIDES } from '@contentrain/skills'

// Discover skills: name + description for agent activation
AGENT_SKILLS.forEach(({ name, description }) => {
  console.log(`${name}: ${description}`)
})

// Backward compat: flat workflow list
console.log(WORKFLOW_SKILLS.length) // 12

// Framework discovery
console.log(FRAMEWORK_GUIDES)
```

## Progressive Disclosure

| Tier | What's Loaded | When | Token Cost |
|------|--------------|------|------------|
| 1. Catalog | `name` + `description` (AGENT_SKILLS) | Session start | ~50 tokens/skill |
| 2. Instructions | Full `SKILL.md` body | Skill activated | < 5000 tokens |
| 3. References | `references/*.md` files | Agent needs detail | Varies (50-500 tokens/file) |

This reduces always-loaded context from thousands of lines to just the essentials plus catalog.

## Parity with `@contentrain/mcp`

`@contentrain/skills` is kept in lockstep with the MCP tool registry via cross-package parity tests (`tests/mcp-parity.test.ts`):

- `skills/contentrain/references/mcp-tools.md` must have an `### <tool>` heading for every tool in the MCP `TOOL_NAMES` registry (currently 17).
- Key skills (normalize, translate) must not reference legacy `contentrain/{operation}/...` branch prefixes — MCP now emits `cr/*`.

When MCP's surface changes, these tests fail until the skill docs catch up.

## IDE Support

Skills are installed by `contentrain init` (and re-applied with `contentrain skills --update`) for detected IDEs:

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
