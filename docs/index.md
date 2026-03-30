---
title: Contentrain AI
description: "Extract, govern, and ship structured content from your codebase."
order: 0
category: getting-started
slug: index
layout: home

hero:
  name: Contentrain AI
  text: Extract, govern, and ship structured content from your codebase
  tagline: "Turn hardcoded UI text, docs, and structured content into a governed, reviewable content layer. Agents do the extraction work, Contentrain enforces schema, Git review, and portable output."
  image:
    src: /hero-pipeline.png
    alt: Contentrain AI Pipeline — Agent generates, MCP validates, Human reviews, Git commits, content delivered
  actions:
    - theme: brand
      text: See 2-Minute Demo
      link: /demo
    - theme: alt
      text: Start the Normalize Flow
      link: /guides/normalize

features:
  - icon:
      src: /icons/structure.svg
      alt: Structure
      width: 24
      height: 24
    title: Structure
    details: Define content models or extract them from existing code. Your AI agent handles the work — Contentrain provides the deterministic infrastructure.
    link: /getting-started
  - icon:
      src: /icons/govern.svg
      alt: Govern
      width: 24
      height: 24
    title: Govern
    details: Every content change goes through Git branches, validation, and human review. Nothing reaches production without approval.
    link: /packages/mcp
  - icon:
      src: /icons/translate.svg
      alt: Translate
      width: 24
      height: 24
    title: Translate
    details: Per-locale JSON files, dictionary models with parameterized templates, and bulk locale operations. i18n is built in, not bolted on.
    link: /guides/i18n
  - icon:
      src: /icons/deliver.svg
      alt: Deliver
      width: 24
      height: 24
    title: Deliver
    details: Plain JSON and Markdown files — consumable by any platform, any language. TypeScript SDK for convenience, but the files are the product.
    link: /packages/sdk
---

## Start With the Mess You Already Have

AI made you faster at producing code. It did not solve what happens to the content inside that code.

**Already shipped?** Hardcoded UI text lives across components, pages, and docs. No translation path, no single source of truth:

- **Monday:** Founder says "we need Turkish"
- **Tuesday:** Marketer wants to change the hero headline — it's in 7 files
- **Wednesday:** Mobile team asks for the same content via API
- **Friday:** You're still doing grep-and-replace

This is the first wedge for Contentrain:

**take the content chaos already living in your codebase and turn it into a governed, reviewable content layer.**

**Starting fresh?** That still matters. You can begin with a real content layer from day one. But the most urgent use case is rescue, not prevention.

**This is not mainly a CMS problem. It's a governance problem.** AI can produce content quickly; Contentrain governs how that content gets structured, reviewed, translated, and delivered.

## Three Core Use Cases

::: code-group

```bash [Hardcoded Strings Rescue]
# Existing app? This is the main entry point
npx contentrain init
# Then tell your agent: "Scan my project and extract hardcoded UI strings"
```

```bash [Day-One Content Layer]
# New project? Start with structured content instead of inline strings
npx contentrain init
# Then tell your agent: "Create a hero section model with title, subtitle, and CTA"
```

```bash [Cross-Platform Delivery]
# Same content for web, docs, mobile, and backend consumers
npx contentrain generate
# Use plain JSON/Markdown or the typed SDK in TypeScript apps
```

:::

## Start Here

If you only want to understand the product once before going deeper:

1. Read the [2-Minute Demo](/demo)
2. Use the full [Normalize Flow](/guides/normalize) on a real repo
3. Follow [Getting Started](/getting-started)

**Before** (hardcoded, untranslatable, unmanageable):
```vue
<h1>Build faster with AI-powered content</h1>
<p>Ship your next project in days, not weeks</p>
<button>Get started free</button>
```

**After** (structured, translatable, platform-independent):
```vue
<h1>{{ t('hero.title') }}</h1>
<p>{{ t('hero.subtitle') }}</p>
<button>{{ t('cta.get_started') }}</button>
```

Content lives in plain JSON — any platform can read it:

```json
{
  "hero.title": "Build faster with AI-powered content",
  "hero.subtitle": "Ship your next project in days, not weeks",
  "cta.get_started": "Get started free"
}
```

## Who It Is For

### AI-assisted product teams

You already use Claude Code, Cursor, or another agent and want content changes to go through a real reviewable system instead of landing as random string edits.

### Teams with hardcoded UI copy or docs in source

You need to extract strings, make i18n possible, and stop treating copy updates like grep-and-replace work.

### Builders who want Git-native content, not dashboard-first content

You want plain JSON and Markdown in Git, optional SDK ergonomics, and a content layer your stack can consume directly.

## Who It Is Not For

- Teams looking for a hosted CMS as the primary product experience
- Teams that do not want Git in the content workflow
- Teams that do not use AI agents and do not need a governed extraction/review layer

## Platform Independent

Contentrain outputs plain JSON and Markdown files. **Any platform that can read JSON can consume your content:**

- Web frameworks (Vue, React, Nuxt, Next.js, Astro, SvelteKit)
- Mobile (React Native, Flutter, Swift, Kotlin)
- Backend (Node.js, Go, Python, Rust, .NET)
- Desktop (Electron, Tauri)
- Game engines, IoT, email templates, CLI tools

The TypeScript SDK (`@contentrain/query`) provides type-safe queries as a convenience — but it's optional. The content files are the product, not the SDK.

## Bring Your Own Agent

Contentrain does not ship its own model. Your agent (Claude Code, Cursor, Windsurf, or any MCP-compatible tool) **is** the intelligence layer. Contentrain provides deterministic MCP tools and CLI workflows that enforce consistency:

```
Agent decides what to extract → MCP validates and writes → Human reviews → Git commits
```

No AI markup in your code. No proprietary syntax. No vendor lock-in. If you stop using Contentrain, your content files are still plain JSON in your Git repo.

::: info Contentrain Studio
[Contentrain Studio](/studio) is the hosted team layer for Contentrain: chat-first operations, role-based collaboration, branch review, media management, and CDN delivery on top of the same Git-native content model.
:::
