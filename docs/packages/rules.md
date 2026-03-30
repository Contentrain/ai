---
title: Rules & Skills
description: Complete reference for @contentrain/rules and @contentrain/skills — the policy and procedural layers that govern how AI agents interact with Contentrain
order: 4
slug: rules
---

# Rules & Skills

[![rules npm](https://img.shields.io/npm/v/@contentrain/rules?label=rules)](https://www.npmjs.com/package/@contentrain/rules) [![skills npm](https://img.shields.io/npm/v/@contentrain/skills?label=skills)](https://www.npmjs.com/package/@contentrain/skills)

Contentrain splits agent guidance into two complementary packages:

- **`@contentrain/rules`** — the policy layer (what is allowed, what is not)
- **`@contentrain/skills`** — the procedural layer (step-by-step workflows)

Together, they ensure that any AI agent — whether Claude, GPT, or a custom model — follows the same quality standards and operational patterns when working with Contentrain content.

## Why Separate Rules and Skills?

Consider the difference between a traffic law and a driving manual:

- **Rules** say "speed limit is 60 km/h" and "stop at red lights" — constraints that must always hold
- **Skills** say "to parallel park: signal, position your car, turn the wheel..." — procedures for specific tasks

An agent needs both. Rules prevent it from producing invalid content or breaking schemas. Skills guide it through multi-step workflows like normalize, content creation, or SDK generation.

::: tip The Agent-MCP-Rules Triangle
- **MCP** = deterministic execution (how files are written)
- **Rules** = behavioral constraints (what quality standards to meet)
- **Skills** = workflow procedures (what steps to follow)
:::

## Rules (`@contentrain/rules`)

### What Rules Govern

Rules define non-negotiable constraints across several domains:

| Domain | File | What It Covers |
|--------|------|---------------|
| Content Quality | `content-quality.md` | Writing standards, tone, accuracy, completeness |
| Schema Design | `schema-rules.md` | Field types, naming conventions, model structure |
| i18n Quality | `i18n-quality.md` | Locale consistency, translation completeness, key naming |
| SEO | `seo-rules.md` | Meta descriptions, titles, structured data |
| Accessibility | `accessibility-rules.md` | Alt text, ARIA labels, semantic markup |
| Security | `security-rules.md` | Input sanitization, sensitive data handling |
| Media | `media-rules.md` | Image optimization, file naming, asset organization |
| Content Conventions | `content-conventions.md` | Markdown formatting, frontmatter patterns |
| MCP Usage | `mcp-usage.md` | Tool calling patterns, dry-run protocol, trust levels |
| Workflow Rules | `workflow-rules.md` | Branch management, review process, merge criteria |
| Normalize Rules | `normalize-rules.md` | Extraction patterns, reuse expressions, scope safety |

### Prompt Layers

Rules include mode-specific prompt layers that agents load based on their current task:

| Prompt | Purpose |
|--------|---------|
| `common.md` | Base context loaded for all operations |
| `generate-mode.md` | Additional context for SDK generation tasks |
| `normalize-mode.md` | Additional context for normalize (scan/extract/reuse) |
| `review-mode.md` | Additional context for content review and approval |

### Context Bridge

The `context-bridge.md` file defines how agents should read and interpret `.contentrain/context.json` — the metadata file that MCP updates after every write operation. This ensures agents understand project state without making redundant tool calls.

### Programmatic Access

```ts
import {
  FIELD_TYPES,
  MODEL_KINDS,
  MCP_TOOLS,
  ESSENTIAL_RULES_FILE,
  STACKS,
} from '@contentrain/rules'

// Check if a tool exists
console.log(MCP_TOOLS.includes('contentrain_validate')) // true

// Path to essential guardrails markdown
console.log(ESSENTIAL_RULES_FILE) // 'essential/contentrain-essentials.md'

// All 27 field types
console.log(FIELD_TYPES.length) // 27
```

## Skills (`@contentrain/skills`)

### Agent Skills (Standard Format)

Skills follow the [Agent Skills standard](https://agentskills.io) with progressive disclosure: each skill has a `SKILL.md` (loaded on activation, < 500 lines) and optional `references/` (loaded on demand).

| Skill | Directory | When to Use |
|-------|-----------|------------|
| Contentrain | `skills/contentrain/` | Core architecture, MCP tools, content formats |
| Normalize | `skills/contentrain-normalize/` | Extract hardcoded strings, patch source files |
| Quality | `skills/contentrain-quality/` | Content quality, SEO, accessibility, media |
| SDK | `skills/contentrain-sdk/` | @contentrain/query usage (local + CDN) |
| Content | `skills/contentrain-content/` | Add/update content entries |
| Model | `skills/contentrain-model/` | Create/modify model definitions |
| Init | `skills/contentrain-init/` | Initialize Contentrain project |
| Bulk | `skills/contentrain-bulk/` | Batch operations |
| Validate | `skills/contentrain-validate-fix/` | Validate and auto-fix |
| Review | `skills/contentrain-review/` | Review content changes |
| Translate | `skills/contentrain-translate/` | Multi-locale translation |
| Generate | `skills/contentrain-generate/` | Generate SDK client |
| Serve | `skills/contentrain-serve/` | Local review/normalize UI |
| Diff | `skills/contentrain-diff/` | Branch content diffs |
| Doctor | `skills/contentrain-doctor/` | Project health check |

Each skill directory contains:
```
skills/{name}/
├── SKILL.md           # Instructions (< 500 lines, < 5000 tokens)
└── references/        # Detailed reference docs (loaded on demand)
    └── *.md
```

### Framework Guides

Skills include framework-specific guides that teach agents how Contentrain integrates with popular stacks:

| Framework | File | Key Topics |
|-----------|------|------------|
| Vue | `vue.md` | Composition API, `<script setup>`, reactive content |
| Nuxt | `nuxt.md` | `useAsyncData`, server routes, Nuxt Content integration |
| Next.js | `next.md` | RSC, App Router, `getStaticProps`, ISR patterns |
| Astro | `astro.md` | Frontmatter queries, content collections, islands |
| SvelteKit | `sveltekit.md` | `+page.server.ts` loaders, `$lib` patterns |
| React | `react.md` | Hooks, context providers, client-side queries |
| Expo | `expo.md` | Metro config, native module resolution |
| React Native | `react-native.md` | Platform-specific content, Metro resolver |
| Node.js | `node.md` | Server-side usage, Express/Fastify integration |

### Programmatic Access

```ts
import { AGENT_SKILLS, WORKFLOW_SKILLS, FRAMEWORK_GUIDES } from '@contentrain/skills'

// Agent Skills catalog (name + description)
console.log(AGENT_SKILLS)

// Backward compat
console.log(WORKFLOW_SKILLS)
console.log(FRAMEWORK_GUIDES.includes('next'))
```

You can also install skills directly:

```bash
npx skills add contentrain/contentrain-ai --skill='*'
```

## IDE Integration

`contentrain init` installs a compact essential guardrails file (~86 lines, always-loaded) plus Agent Skills directories (on-demand) for detected IDEs:

| IDE | Rules Dir | Skills Dir | Format |
|-----|-----------|------------|--------|
| Claude Code | `.claude/rules/` | `.claude/skills/` | Plain markdown |
| Cursor | `.cursor/rules/` | `.cursor/skills/` | `.mdc` with `alwaysApply: true` |
| Windsurf | `.windsurf/rules/` | `.windsurf/skills/` | `trigger: always_on` frontmatter |
| GitHub Copilot | `.github/` | `.agents/skills/` | `copilot-instructions.md` |

::: info Non-Destructive Installation
Existing rule files are not overwritten. Old granular rule files from previous versions are automatically cleaned up.
:::

## How Agents Use Rules and Skills Together

Here is a real example of the agent workflow when a user says "Extract the hardcoded strings from my header component":

### 1. Essential Rules Load First

The agent's essential guardrails (~86 lines) are always loaded from `.claude/rules/contentrain-essentials.md` (or equivalent IDE path). These cover MCP tool catalog, mandatory protocols, and security basics.

### 2. Skill Guides the Workflow

The agent activates `contentrain-normalize` skill (SKILL.md + references/):

```
Step 1: Call contentrain_status (check project is initialized)
Step 2: Call contentrain_scan (find hardcoded strings in source)
Step 3: Classify candidates (agent intelligence, not MCP)
Step 4: Call contentrain_apply mode:"extract" dry_run:true (preview)
Step 5: Review dry-run output with user
Step 6: Call contentrain_apply mode:"extract" dry_run:false (commit)
Step 7: Report results and suggest next steps
```

### 3. Rules Enforce Quality Throughout

At every step, rules constrain the agent:
- Do not extract strings that look like code, URLs, or secrets
- Dictionary keys must follow `kebab-case` naming
- All extractions must go through the review workflow
- Source patches in the reuse phase must be scope-safe

::: warning Critical Rule: Always dry_run First
The most important rule across all Contentrain operations: **always call write tools with `dry_run: true` first**, review the output, then call with `dry_run: false`. This applies to content_save, model_save, apply, and all other write operations.
:::

## Agent Prompt Examples

Here are natural-language prompts that trigger different skill workflows:

| Prompt | Skill Triggered |
|--------|----------------|
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

## Install

```bash
# Rules package
pnpm add @contentrain/rules

# Skills package
pnpm add @contentrain/skills
```

In most cases, you do not install these manually. `contentrain init` handles IDE rule distribution, and MCP agents load skills through their configuration.

## Related Pages

- [MCP Tools](/packages/mcp) — The deterministic execution layer that rules and skills govern
- [CLI](/packages/cli) — `contentrain init` installs IDE rules automatically
- [Query SDK](/packages/sdk) — The generated client for consuming content
- [Contentrain Studio](/studio) — Chat-first team UI where agents use the same rules and skills through a web interface
