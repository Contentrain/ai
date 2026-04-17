---
title: 2-Minute Demo
description: "See Contentrain's core value in one flow: extract hardcoded UI text, create structured content, and patch source files through review"
order: 2
category: getting-started
slug: demo
---

# 2-Minute Demo

This is the **one demo story** that explains Contentrain fastest:

> You have hardcoded UI text in a real app.  
> Your agent extracts it into a governed content layer.  
> Contentrain keeps the process reviewable, typed, and Git-native.

## Before

Your component ships with inline text:

```tsx
export default function Hero() {
  return (
    <section>
      <h1>Build faster with AI-powered content</h1>
      <p>Ship your next project in days, not weeks</p>
      <button>Get started free</button>
    </section>
  )
}
```

This works until:

- marketing wants copy changes
- you need a second language
- mobile needs the same content
- the agent starts editing strings directly in source files

## Step 1. Initialize

```bash
npx contentrain init
```

Now you have a governed `.contentrain/` workspace in your repo.

## Step 2. Connect your agent

Run the local MCP entrypoint:

```bash
npx contentrain serve --stdio
```

Then ask your agent:

> Scan this project and extract the hardcoded strings in the hero section.

## Step 3. Extract

The agent uses `contentrain_scan` to find strings and `contentrain_apply(mode: "extract")` to move them into content files.

Generated content:

```json
{
  "title": "Build faster with AI-powered content",
  "subtitle": "Ship your next project in days, not weeks",
  "cta": "Get started free"
}
```

Example location:

```text
.contentrain/content/marketing/hero-section/en.json
```

At this stage, **source files are untouched**. You can already review, translate, and validate the extracted content.

## Step 4. Reuse

Then ask your agent:

> Replace the hardcoded hero strings with content references.

The agent proposes a dry-run patch, then `contentrain_apply(mode: "reuse")` updates the source file on a review branch.

## After

```tsx
export default function Hero() {
  const hero = singleton('hero-section').locale('en').get()

  return (
    <section>
      <h1>{hero.title}</h1>
      <p>{hero.subtitle}</p>
      <button>{hero.cta}</button>
    </section>
  )
}
```

## Why this demo matters

This one flow shows Contentrain's full value:

- **AI agent does the extraction work**
- **Contentrain enforces schema and Git review**
- **Your content becomes reusable and translatable**
- **Your app consumes plain JSON or the typed SDK**

## What to do next

- Follow the full [Getting Started](/getting-started) guide
- Read the full [Normalize Flow](/guides/normalize)
- Use [Framework Integration](/guides/frameworks) for your stack

## Ready for Team Collaboration?

This demo shows extraction and reuse locally. When your team needs role-based review, web-based collaboration, or CDN delivery for mobile and non-web platforms, connect your project to [Contentrain Studio](/studio):

```bash
contentrain studio login
contentrain studio connect
```

Studio uses the same `.contentrain/` content model — no changes needed.
