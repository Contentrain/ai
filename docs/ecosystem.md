---
title: Ecosystem Map
description: "How Contentrain AI packages and Contentrain Studio fit together across discovery, governance, collaboration, and delivery."
order: 2
category: getting-started
slug: ecosystem
---

# Ecosystem Map

Contentrain has two product surfaces operating on the same `.contentrain/` contract:

- **Contentrain AI** — the open-source, local-first operating core: MCP, CLI, SDK, rules, and skills
- **Contentrain Studio** — the open-core team web surface: chat, review, media, forms, APIs, and CDN delivery

The format does not change. The operating surface does.

## The Split

Use **Contentrain AI** when you need:

- local-first agent workflows
- hardcoded-string rescue through normalize
- direct Git-native content operations from an IDE or terminal
- package-level adoption through `@contentrain/mcp`, `contentrain`, `@contentrain/query`, `@contentrain/rules`, and `@contentrain/skills`

Use **Contentrain Studio** when you need:

- authenticated team workflows in a web app
- role-aware review and approval
- project/workspace management
- media, forms, conversation APIs, and CDN delivery
- self-hosted or managed team collaboration on top of the same content model

## Package Bridges

| AI surface | Primary job | Studio bridge | Go deeper |
|---|---|---|---|
| `@contentrain/mcp` | Deterministic local content operations and normalize | Studio applies the same `.contentrain/` contract through governed web workflows and review surfaces | [MCP Tools](/packages/mcp), [Studio AI Chat](https://docs.contentrain.io/guide/ai-chat) |
| `contentrain` CLI | Bootstrap, validate, diff, generate, serve, and local review | Studio takes over when teams need authenticated review, roles, and project management | [CLI](/packages/cli), [Studio Quickstart](https://docs.contentrain.io/guide/quickstart) |
| `@contentrain/query` | Local typed consumption and CDN client transport | Studio adds remote delivery, API keys, and CDN publishing on top of the same content | [Query SDK](/packages/sdk), [Studio CDN](https://docs.contentrain.io/guide/cdn) |
| `@contentrain/rules` | Quality standard and schema/content guardrails | Studio should match the same quality standard in chat, review, and content validation | [Rules & Skills](/packages/rules), [Studio Architecture](https://docs.contentrain.io/developer/architecture) |
| `@contentrain/skills` | Agent playbooks, workflow hints, and normalize/review procedures | Studio mirrors these workflows in chat-led operations, onboarding, and promotion moments | [Rules & Skills](/packages/rules), [Studio AI Chat](https://docs.contentrain.io/guide/ai-chat) |

## Product Philosophy

- **Governance, not generation** — Contentrain standardizes, validates, and reviews content. Your model provider still does the generation.
- **Git-native, not database-first** — content stays in Git; branches, commits, diffs, and merge rules stay visible.
- **Packages drive adoption** — the AI repo is the easiest entry point for developers and agents.
- **Studio deepens operations** — once content exists, teams need permissions, review, shareable workflows, and delivery surfaces.

## Marketing and Distribution Logic

The growth loop is intentional:

1. **Normalize is the wedge** — most developers discover Contentrain by rescuing hardcoded strings in an existing codebase.
2. **Packages create trust** — MCP, CLI, rules, skills, and query are adoptable independently.
3. **Studio is the expansion surface** — teams move into Studio when review, collaboration, and delivery become operational needs.
4. **CDN and team workflows monetize naturally** — after the content layer already exists.

That means AI docs should mention Studio at natural escalation points:

- after `contentrain init`
- after successful normalize extraction
- when review branches accumulate
- when multiple collaborators or locales appear
- when content must ship beyond web runtime

Studio docs should point back to AI packages whenever they explain:

- where the `.contentrain/` contract comes from
- how normalize starts the journey
- how rules and skills shape agent behavior
- how `@contentrain/query` relates to CDN delivery and consumer apps

## Docs Map

| Need | Canonical surface |
|---|---|
| Package contracts and local workflows | `ai.contentrain.io` |
| Team workflows and product docs | `docs.contentrain.io` |
| Studio deployment and self-hosting | `docs.contentrain.io/developer/self-hosting` |

## Short Definition

Contentrain AI is the package surface that gets structured content into Git. Contentrain Studio is the team surface that helps people review, operate, and deliver that same governed content.
