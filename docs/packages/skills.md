---
title: Skills
description: "@contentrain/skills — 16 on-demand Agent Skills and 9 framework guides that teach an AI agent the Contentrain workflows, with progressive disclosure"
order: 5
slug: skills
---

# Skills

[![npm version](https://img.shields.io/npm/v/@contentrain/skills)](https://www.npmjs.com/package/@contentrain/skills)

`@contentrain/skills` is the **procedural** layer: step-by-step workflows an agent loads when it needs them. Its counterpart, [`@contentrain/rules`](/packages/rules), is the policy layer — the constraints that hold whatever the agent is doing.

The split is the difference between a driving manual and a traffic law. An agent needs both.

## Progressive disclosure

Skills follow the [Agent Skills standard](https://agentskills.io). The point of the standard is that an agent should not pay for instructions it is not using:

| Tier | What loads | When | Cost |
|---|---|---|---|
| 1. Catalog | `name` + `description` (`AGENT_SKILLS`) | Session start | ~50 tokens per skill |
| 2. Instructions | The full `SKILL.md` body | Skill activates | Under 5,000 tokens |
| 3. References | `references/*.md` | The agent needs the detail | 50–500 tokens per file |

Every `SKILL.md` in this package is under 300 lines. The detail lives in 19 reference files behind them — `contentrain` alone has 9 — and none of it is loaded until something asks.

```
skills/{name}/
├── SKILL.md           # Instructions, loaded on activation
└── references/        # Deep dives, loaded on demand
    └── *.md
```

## The 16 skills

The `description` is what the agent matches against — it names the trigger, not just the topic.

| Skill | Activates when |
|---|---|
| `contentrain` | Working with the `.contentrain/` directory, content models, or MCP tools. Core architecture, content formats, tool usage |
| `contentrain-init` | Setting up `.contentrain/`, configuring stack and locales, scaffolding templates |
| `contentrain-model` | Creating models, updating schemas, adding fields, changing model structure |
| `contentrain-content` | Adding entries to collections, populating singletons, writing documents, managing dictionary keys |
| `contentrain-normalize` | Normalizing, extracting hardcoded strings, replacing them with content references — both phases |
| `contentrain-quality` | Reviewing content quality, checking SEO, validating media assets |
| `contentrain-review` | Reviewing, checking quality, or approving changes before publishing |
| `contentrain-validate-fix` | Checking content validity or fixing validation errors |
| `contentrain-translate` | Adding translations, localizing content, managing multi-language entries |
| `contentrain-bulk` | Copying locales, updating status in batches, deleting multiple entries |
| `contentrain-diff` | Comparing changes, reviewing branch differences, checking what changed |
| `contentrain-doctor` | Troubleshooting setup, checking configuration, verifying project integrity |
| `contentrain-serve` | Launching the serve interface, reviewing changes visually, managing normalize plans |
| `contentrain-generate` | Running `contentrain generate`, setting up the SDK, configuring bundler aliases, `#contentrain` imports |
| `contentrain-sdk` | Importing from `#contentrain`, using `QueryBuilder`, `SingletonAccessor`, `DictionaryAccessor`, `DocumentQuery` |
| `contentrain-migrate-wordpress` | Migrating from WordPress, handling a WXR export or REST URL, wiring imported content to Astro, Nuxt or Next |

## Framework guides

Published under `frameworks/` — how Contentrain content is actually consumed on each stack:

| Guide | Covers |
|---|---|
| `nuxt.md` | `useAsyncData`, server routes |
| `next.md` | RSC, App Router, ISR patterns |
| `astro.md` | Frontmatter queries, content collections, islands |
| `sveltekit.md` | `+page.server.ts` loaders, `$lib` patterns |
| `react.md` | Hooks, context providers, client-side queries |
| `vue.md` | Composition API, `<script setup>`, reactive content |
| `expo.md` | Metro config, native module resolution |
| `react-native.md` | Platform-specific content, Metro resolver |
| `node.md` | Server-side usage, Express / Fastify integration |

See the [Framework Integration guide](/guides/frameworks) for the same material written for humans.

## Install

Most projects never install this package by hand — `contentrain init` distributes skills to whichever IDEs it detects, and `contentrain skills --update` refreshes them after an upgrade.

To install into an agent directly:

```bash
# All 16 skills
npx skills add Contentrain/ai/packages/skills

# One skill
npx skills add Contentrain/ai/packages/skills --skill contentrain-normalize

# Into a specific agent
npx skills add Contentrain/ai/packages/skills --agent claude-code

# See what is available
npx skills add Contentrain/ai/packages/skills --list
```

Works with Claude Code, Cursor, Windsurf, GitHub Copilot, OpenAI Codex, Gemini CLI, and 40+ other agents.

For programmatic access to the catalogs:

```bash
pnpm add @contentrain/skills
```

```ts
import { AGENT_SKILLS, WORKFLOW_SKILLS, FRAMEWORK_GUIDES } from '@contentrain/skills'

// Tier 1: what an agent needs to decide whether to load a skill
AGENT_SKILLS.forEach(({ name, description }) => {
  console.log(`${name}: ${description}`)
})

console.log(FRAMEWORK_GUIDES) // ['nuxt', 'next', 'astro', …]
console.log(WORKFLOW_SKILLS.length) // 12 — the flat legacy list
```

## IDE distribution

| IDE | Rules directory | Skills directory |
|---|---|---|
| Claude Code | `.claude/rules/` | `.claude/skills/` |
| Cursor | `.cursor/rules/` | `.cursor/skills/` |
| Windsurf | `.windsurf/rules/` | `.windsurf/skills/` |
| GitHub Copilot | `.github/` | `.agents/skills/` |

```bash
contentrain skills --update   # refresh after upgrading packages
contentrain skills --list     # check what is installed
```

::: info Non-destructive
Existing rule files are never overwritten. Granular rule files from older versions are cleaned up on update.
:::

## Claude Code plugin

Claude Code users can skip the per-skill install entirely:

```
/plugin marketplace add Contentrain/ai
```

The plugin bundles the MCP server together with a curated subset of these skills and the framework guides — the shortest path from nothing to a working Contentrain agent.

## Parity with the MCP tool registry

Skills documenting MCP tools drift the moment a tool is added. Cross-package parity tests (`tests/mcp-parity.test.ts`) keep them honest:

- `skills/contentrain/references/mcp-tools.md` must carry an `### <tool>` heading for **every** tool in the MCP `TOOL_NAMES` registry
- key skills must not reference legacy `contentrain/{operation}/…` branch prefixes — MCP emits `cr/*`

When the MCP surface changes, these tests fail until the skill docs catch up. That is the intended failure: the skills are a published contract, not a description.

## Backward-compatible workflow files

`workflows/` holds 12 flat markdown files from before the Agent Skills structure. They still work; new projects should use `skills/`.

## Embedded SDK skill

`@contentrain/query` ships its own Agent Skill at `skills/contentrain-query/SKILL.md` inside the npm package, so an agent that has the SDK installed can load type-safe usage guidance without this package.

## What prompts trigger what

| Prompt | Skill |
|---|---|
| "Set up Contentrain in this project" | `contentrain-init` |
| "Create a FAQ model with question and answer fields" | `contentrain-model` |
| "Add 5 blog posts about TypeScript" | `contentrain-content` |
| "Extract the hardcoded strings from my landing page" | `contentrain-normalize` |
| "Translate all content to French" | `contentrain-translate` |
| "Check my content for errors and fix them" | `contentrain-validate-fix` |
| "Generate the SDK client" | `contentrain-generate` |
| "Start the review UI" | `contentrain-serve` |
| "Review the pending content branches" | `contentrain-review` |
| "Copy all English content to Turkish" | `contentrain-bulk` |
| "Migrate this WordPress site" | `contentrain-migrate-wordpress` |

## Related Pages

- [Rules](/packages/rules) — the policy layer these procedures run inside
- [MCP Tools](/packages/mcp) — the deterministic execution layer the skills drive
- [Framework Integration](/guides/frameworks) — the framework guides, for humans
- [Normalize Flow](/guides/normalize) — the workflow `contentrain-normalize` encodes
- [WordPress Migration](/guides/migration) — the workflow `contentrain-migrate-wordpress` encodes
