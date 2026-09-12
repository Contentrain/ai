---
title: Rules
description: "@contentrain/rules — the always-loaded policy layer: the constraints an AI agent must hold to whatever workflow it is running"
order: 4
slug: rules
---

# Rules

[![npm version](https://img.shields.io/npm/v/@contentrain/rules)](https://www.npmjs.com/package/@contentrain/rules)

`@contentrain/rules` is the **policy** layer: what is allowed and what is not, loaded for every conversation regardless of the task. Its counterpart, [`@contentrain/skills`](/packages/skills), is the procedural layer — the step-by-step workflows an agent loads on demand.

Together they mean any agent — Claude, GPT, or a custom model — holds the same quality standards and operational patterns when it touches Contentrain content.

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

## Studio Bridge

`@contentrain/rules` and `@contentrain/skills` are not only for local IDE agents. They are also the package-level contract that Studio should mirror in its chat, validation, onboarding, and review flows.

The alignment model is simple:

- local agents use rules and skills directly through IDE integrations
- Studio translates the same standards into its authenticated web workflows
- marketing and distribution should point users from the normalize wedge into Studio without changing the underlying quality model

See [Ecosystem Map](/ecosystem) for the full package map, then compare the Studio surface here:

- [Contentrain Studio](/studio)
- [Studio Ecosystem Map](https://docs.contentrain.io/guide/ecosystem)
- [Studio Architecture](https://docs.contentrain.io/developer/architecture)

## What Rules Govern

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

## Prompt Layers

Rules include mode-specific prompt layers that agents load based on their current task:

| Prompt | Purpose |
|--------|---------|
| `common.md` | Base context loaded for all operations |
| `generate-mode.md` | Additional context for SDK generation tasks |
| `normalize-mode.md` | Additional context for normalize (scan/extract/reuse) |
| `review-mode.md` | Additional context for content review and approval |

## Context Bridge

The `context-bridge.md` file defines how agents should read and interpret `.contentrain/context.json` — the metadata file that MCP updates after every write operation. This ensures agents understand project state without making redundant tool calls.

## Programmatic Access

```ts
import {
  FIELD_TYPES,
  MODEL_KINDS,
  MCP_TOOLS,
  ESSENTIAL_RULES_FILE,
  STACKS,
} from '@contentrain/rules'

// The full registry — not the subset any one session lists
console.log(MCP_TOOLS.length)                           // 27
console.log(MCP_TOOLS.includes('contentrain_validate')) // true
console.log(MCP_TOOLS.includes('contentrain_reconcile')) // true
console.log(MCP_TOOLS.includes('contentrain_doctor'))   // true

// Path to essential guardrails markdown
console.log(ESSENTIAL_RULES_FILE) // 'essential/contentrain-essentials.md'

// All 27 field types
console.log(FIELD_TYPES.length) // 27
```

## Skills live in their own package

The procedural half — 16 Agent Skills, 9 framework guides, and the progressive-disclosure model that keeps them cheap — moved to its own page: **[Skills](/packages/skills)**.

The two packages ship and version separately, and an agent can load either without the other. What follows applies to both, because `contentrain init` distributes both.

## IDE Integration

`contentrain init` installs a compact essential guardrails file (always-loaded) plus Agent Skills directories (on-demand) for detected IDEs:

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

The agent's essential guardrails are always loaded from `.claude/rules/contentrain-essentials.md` (or equivalent IDE path). These cover MCP tool catalog, mandatory protocols, and security basics.

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

## Install

```bash
# Rules package
pnpm add @contentrain/rules

# Skills package
pnpm add @contentrain/skills
```

In most cases, you do not install these manually. `contentrain init` handles IDE rule distribution, and MCP agents load skills through their configuration.

To update skills and rules after upgrading packages:

```bash
contentrain skills --update
```

To check installed status:

```bash
contentrain skills --list
```

## AGENTS.md

The repo root includes an [`AGENTS.md`](https://github.com/Contentrain/ai/blob/main/AGENTS.md) file following the [AGENTS.md standard](https://agents.md). This file provides project-level guidance for any AI agent (Codex, Copilot, Gemini CLI, etc.) working with the repo — skill catalog, essential rules reference, key constraints, and framework guides.

## Related Pages

- [Skills](/packages/skills) — the procedural layer these constraints hold around
- [MCP Tools](/packages/mcp) — the deterministic execution layer that rules govern
- [CLI](/packages/cli) — `contentrain init` installs IDE rules automatically
- [Query SDK](/packages/sdk) — the generated client for consuming content (ships an embedded skill)
- [Contentrain Studio](/studio) — chat-first team UI where agents use the same rules through a web interface
