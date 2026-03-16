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
  CONTENT_QUALITY_RULES,
  ARCHITECTURE_RULES,
  ALL_SHARED_RULES,
  IDE_RULE_FILES,
  STACKS,
} from '@contentrain/rules'

// Check if a tool exists
console.log(MCP_TOOLS.includes('contentrain_validate')) // true

// Get IDE rule file paths
console.log(IDE_RULE_FILES['claude-code'])

// List all shared rules
console.log(ALL_SHARED_RULES)
```

## Skills (`@contentrain/skills`)

### Workflow Skills

Skills are step-by-step playbooks that guide agents through complete workflows:

| Skill | File | When to Use |
|-------|------|------------|
| Init | `contentrain-init.md` | "Initialize Contentrain in my project" |
| Model | `contentrain-model.md` | "Create a blog post model" |
| Content | `contentrain-content.md` | "Add content to my blog" |
| Bulk | `contentrain-bulk.md` | "Copy all content to Turkish locale" |
| Normalize | `contentrain-normalize.md` | "Extract hardcoded strings from my components" |
| Validate & Fix | `contentrain-validate-fix.md` | "Check my content for errors" |
| Review | `contentrain-review.md` | "Review pending content changes" |
| Diff | `contentrain-diff.md` | "Show me what changed in the contentrain branches" |
| Doctor | `contentrain-doctor.md` | "Check my project health" |
| Serve | `contentrain-serve.md` | "Start the review UI" |
| Translate | `contentrain-translate.md` | "Translate my content to French" |
| Generate | `contentrain-generate.md` | "Generate the SDK client" |

Each skill follows a consistent structure:
1. **When to Use** — trigger phrases and conditions
2. **Steps** — numbered sequence of MCP tool calls and agent decisions
3. **Verification** — how to confirm the operation succeeded
4. **Error Handling** — what to do when things go wrong

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
import { WORKFLOW_SKILLS, FRAMEWORK_GUIDES } from '@contentrain/skills'

console.log(WORKFLOW_SKILLS)
// ['contentrain-init', 'contentrain-model', 'contentrain-content', ...]

console.log(FRAMEWORK_GUIDES.includes('next'))
// true
```

## IDE Integration

`contentrain init` automatically installs rule files for your IDE agent:

### Claude Code

Rules are appended to `CLAUDE.md` in your project root. Claude Code reads this file automatically.

```bash
# After contentrain init, CLAUDE.md contains:
# - Project-level Contentrain rules
# - MCP tool usage guidelines
# - Quality gate requirements
```

### Cursor

Rules are written to `.cursorrules` in your project root:

```bash
# .cursorrules contains Contentrain agent rules
# Cursor loads this automatically for every conversation
```

### Windsurf

Rules are written to `.windsurfrules` in your project root:

```bash
# .windsurfrules contains Contentrain agent rules
# Windsurf loads this automatically
```

::: info Non-Destructive Installation
If rule files already exist, `contentrain init` appends Contentrain rules instead of overwriting your existing content.
:::

## How Agents Use Rules and Skills Together

Here is a real example of the agent workflow when a user says "Extract the hardcoded strings from my header component":

### 1. Rules Load First

The agent loads from its IDE rules file:
- `mcp-usage.md` — tool calling protocol (always dry-run first)
- `normalize-rules.md` — extraction safety constraints
- `security-rules.md` — never extract secrets or credentials
- `content-quality.md` — extracted content must meet quality standards

### 2. Skill Guides the Workflow

The agent follows `contentrain-normalize.md`:

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
