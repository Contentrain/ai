---
title: Contentrain AI
description: "AI-generated content governance infrastructure — extract, structure, review, and deliver content across any platform"
order: 0
category: getting-started
slug: index
layout: home

hero:
  name: Contentrain AI
  text: You ship fast with AI. But then what?
  tagline: "500 hardcoded strings. No translation path. No structure. Contentrain extracts, standardizes, and governs your content — all through Git, any platform, any AI agent."
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
  - icon: 🔍
    title: Extract
    details: Your AI agent scans your codebase, finds hardcoded strings, classifies them into structured content models — in minutes, not days.
    link: /guides/normalize
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
    details: Plain JSON and Markdown files — consumable by any platform. TypeScript SDK for convenience, but any language can read the output.
    link: /packages/sdk
---

## The Problem

You've been shipping fast with AI — Cursor, Claude Code, Copilot. Your landing page is live. 47 components, 500+ strings hardcoded in templates.

Then reality hits:

- **Monday:** Founder says "we need Turkish"
- **Tuesday:** Marketer wants to change the hero headline — it's in 7 files
- **Wednesday:** Mobile team asks for the same content via API
- **Thursday:** New hire can't find where "Get started free" lives
- **Friday:** You're still doing grep-and-replace

**This isn't a CMS problem. It's a governance problem.** Your AI generates content fast, but there's no structure, no review, no single source of truth.

## The Fix: 3 Minutes, Not 3 Days

```bash
# 1. Initialize
npx contentrain init

# 2. Tell your agent
"Scan my project and extract all hardcoded strings"

# 3. Done
# Content extracted → models created → source patched → review UI ready
```

**Before:**
```vue
<h1>Build faster with AI-powered content</h1>
<p>Ship your next project in days, not weeks</p>
<button>Get started free</button>
```

**After:**
```vue
<h1>{{ t('hero.title') }}</h1>
<p>{{ t('hero.subtitle') }}</p>
<button>{{ t('cta.get_started') }}</button>
```

Content now lives in structured JSON files — translatable, manageable, platform-independent:

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
