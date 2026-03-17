---
title: Contentrain AI
description: "AI-generated content governance infrastructure — extract, structure, review, and deliver content across any platform"
order: 0
category: getting-started
slug: index
layout: home

hero:
  name: Contentrain AI
  text: AI generates fast. Who governs what it produces?
  tagline: "Whether you're cleaning up 500 hardcoded strings or starting a new project — Contentrain gives your AI-generated content structure, review, and delivery. All through Git, any platform, any agent."
  image:
    src: /hero-pipeline.png
    alt: Contentrain AI Pipeline — Agent generates, MCP validates, Human reviews, Git commits, content delivered
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/Contentrain/ai

features:
  - icon: 🏗️
    title: Structure
    details: Define content models or extract them from existing code. Your AI agent handles the work — Contentrain provides the deterministic infrastructure.
    link: /getting-started
  - icon: ✅
    title: Govern
    details: Every content change goes through Git branches, validation, and human review. Nothing reaches production without approval.
    link: /packages/mcp
  - icon: 🌍
    title: Translate
    details: Per-locale JSON files, dictionary models with parameterized templates, and bulk locale operations. i18n is built in, not bolted on.
    link: /guides/i18n
  - icon: 📦
    title: Deliver
    details: Plain JSON and Markdown files — consumable by any platform, any language. TypeScript SDK for convenience, but the files are the product.
    link: /packages/sdk
---

## The Problem

AI made you 10x faster at producing code. But nobody solved what happens to the content inside that code.

**Already shipped?** 47 components, 500+ hardcoded strings. No translation path, no single source of truth:

- **Monday:** Founder says "we need Turkish"
- **Tuesday:** Marketer wants to change the hero headline — it's in 7 files
- **Wednesday:** Mobile team asks for the same content via API
- **Friday:** You're still doing grep-and-replace

**Starting fresh?** Without a content layer from day one, you'll be in the same place in 2 weeks. AI generates fast, but the strings it produces have no structure, no governance, no review process.

**This isn't a CMS problem. It's a governance problem.** AI produces content — but who validates it, who reviews it, who standardizes it, and how does it reach every platform?

## Two Starting Points

::: code-group

```bash [Existing Project — Rescue]
# Extract 500+ hardcoded strings in minutes
npx contentrain init
# Then tell your agent:
"Scan my project and extract all hardcoded strings"
# Content extracted → models created → source patched → review UI ready
```

```bash [New Project — Prevention]
# Start with structured content from day one
npx contentrain init
# Then tell your agent:
"Create a hero section model with title, subtitle, and CTA"
# Models defined → content structured → SDK ready → i18n built in
```

:::

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

## Who Is This For?

### Vibe Coders & Solo Developers

You ship 50+ AI-generated files per week. Content is scattered across every component. `contentrain init` + one prompt to your agent = structured, translatable content in minutes. Zero infrastructure cost — just Git files.

### Indie Hackers & Small Teams

You need i18n but keep postponing it. You want to hand off copy changes to a non-developer. Contentrain gives you structured content without CMS complexity — and [Studio](https://studio.contentrain.io) when you're ready for team review.

### Agencies & Freelancers

Same content architecture for every client project. Scaffold in 5 minutes, deliver a Studio login, move on. No more "can you change this text?" support tickets.

### Startups

Your marketer can't change a headline without a developer PR. Your mobile app needs the same content as your website. Contentrain breaks the developer bottleneck — agent generates, marketer reviews, same content serves everywhere.

## Platform Independent

Contentrain outputs plain JSON and Markdown files. **Any platform that can read JSON can consume your content:**

- Web frameworks (Vue, React, Nuxt, Next.js, Astro, SvelteKit)
- Mobile (React Native, Flutter, Swift, Kotlin)
- Backend (Node.js, Go, Python, Rust, .NET)
- Desktop (Electron, Tauri)
- Game engines, IoT, email templates, CLI tools

The TypeScript SDK (`@contentrain/query`) provides type-safe queries as a convenience — but it's optional. The content files are the product, not the SDK.

## Bring Your Own Agent

Contentrain doesn't ship AI. Your agent (Claude Code, Cursor, Windsurf, or any MCP-compatible tool) **is** the intelligence layer. Contentrain provides 13 deterministic MCP tools that enforce consistency:

```
Agent decides what to extract → MCP validates and writes → Human reviews → Git commits
```

No AI markup in your code. No proprietary syntax. No vendor lock-in. If you stop using Contentrain, your content files are still plain JSON in your Git repo.

::: info Contentrain Studio
When you need team collaboration, visual diff review, and content CDN for non-web platforms — [Contentrain Studio](https://studio.contentrain.io) extends everything with a hosted governance UI.
:::
