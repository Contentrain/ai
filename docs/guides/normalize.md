---
title: Normalize Flow
description: Extract hardcoded strings from your codebase, replace them with content references, and translate — a complete three-phase guide with real examples
order: 1
slug: normalize
---

# Normalize Flow

The normalize flow is Contentrain's **primary value proposition** — the fastest path from "500 hardcoded strings scattered across my codebase" to "structured, translatable, manageable content." It runs in three phases: **Extract**, **Reuse**, and **Translate**.

## The Problem

A typical SaaS landing page has 40-60 components with 300-800 hardcoded strings. Nobody notices until someone asks for a second language or a copy change across 12 pages.

```vue
<template>
  <section class="hero">
    <h1>Build faster with AI-powered content</h1>
    <p>Ship your next project in days, not weeks</p>
    <button>Get started free</button>
  </section>
</template>
```

These strings are scattered across dozens of files. Translating means grep-and-replace. Updating copy means hunting through templates. There is no single source of truth, no way to hand off content to a non-developer, and no translation path that doesn't involve touching every component.

**The normalize flow extracts all of this in minutes, not days.** The agent scans your components, classifies every string, creates structured content models, and patches your source files — all reviewable, all through Git.

## Three Phases Overview

| Phase | What happens | Source files modified? | Branch pattern |
|---|---|---|---|
| 1. Extract | Strings pulled into `.contentrain/content/` | No | `contentrain/normalize/extract/{ts}` |
| 2. Reuse | Source files patched to reference content | Yes | `contentrain/normalize/reuse/{model}/{ts}` |
| 3. Translate | Content copied to new locales and translated | No | Standard content branch |

::: tip
Phase 1 is valuable on its own. Extracted content can be managed in [Contentrain Studio](/studio), translated, and published without touching source code.
:::

## Phase 1: Extract

Pull hardcoded strings from your codebase into Contentrain content files.

### Step 1. Check project state

Ask your agent to verify the project is initialized:

> "Check if Contentrain is initialized and show me the project status"

The agent calls `contentrain_status` to confirm `.contentrain/` exists, locales are configured, and there are no pending changes.

### Step 2. Build the project graph

The agent needs to understand your project structure before scanning:

> "Scan my project structure so you understand the component hierarchy"

The agent calls `contentrain_scan(mode: "graph")` to build an import/component dependency graph. This reveals which components are shared, which are page-specific, and how they relate.

### Step 3. Find candidate strings

Now scan for hardcoded user-visible strings:

> "Find all hardcoded strings in my landing page components"

The agent calls `contentrain_scan(mode: "candidates")` iteratively, file by file. Each scan returns candidates with file paths, line numbers, string values, and context.

### Step 4. Evaluate candidates

This is where agent intelligence matters. The agent filters, classifies, and structures the candidates:

- **Filters false positives:** CSS values, technical identifiers, import paths, variable names, log messages
- **Assigns domains:** Groups strings by domain (`marketing`, `ui`, `blog`)
- **Determines model types:**

| Model kind | Use when | Example |
|---|---|---|
| Dictionary | Short UI strings, labels, buttons | `"Get started"`, `"Submit"` |
| Singleton | Page-specific structured content | Hero section with title + subtitle + CTA |
| Collection | Repeating items with shared schema | Testimonials, FAQs, feature cards |
| Document | Long-form with markdown body | Blog posts, documentation pages |

### Step 5. Write the normalize plan

The agent writes `.contentrain/normalize-plan.json`:

```json
{
  "version": 1,
  "status": "pending",
  "created_at": "2026-03-16T12:00:00.000Z",
  "agent": "claude",
  "scan_stats": {
    "files_scanned": 12,
    "raw_strings": 87,
    "candidates_sent": 34,
    "extracted": 18,
    "skipped": 16
  },
  "models": [
    {
      "id": "hero-section",
      "kind": "singleton",
      "domain": "marketing",
      "i18n": true,
      "fields": {
        "title": { "type": "string", "required": true },
        "subtitle": { "type": "string" },
        "cta_text": { "type": "string" }
      }
    }
  ],
  "extractions": [
    {
      "value": "Build faster with AI-powered content",
      "file": "src/components/Hero.vue",
      "line": 3,
      "model": "hero-section",
      "field": "title"
    }
  ]
}
```

### Step 6. Review in Serve UI

Start the review UI:

```bash
npx contentrain serve
```

Navigate to `http://localhost:3333/normalize` to visually inspect the plan. You can:

- Review each extraction grouped by model
- See the original source location for each string
- Preview the patch changes
- **Approve** or **Reject** the plan

::: warning
Normalize operations always use the review workflow. The agent never auto-merges normalize branches.
:::

### Step 7. Apply extraction

After approval, the agent executes the extraction:

> "Apply the normalize plan"

The agent calls `contentrain_apply(mode: "extract", dry_run: true)` first to preview, then `contentrain_apply(mode: "extract", dry_run: false)` to execute.

This creates model definitions and content files in `.contentrain/` on a dedicated branch. **Source files are NOT modified.**

### Step 8. Validate and submit

> "Validate the extracted content and submit for review"

The agent calls `contentrain_validate` then `contentrain_submit` to push the branch.

### Step 9. Merge Phase 1 branch

Before starting Phase 2, the extraction branch must be merged:

- **Browser:** `http://localhost:3333/branches` → click Merge
- **MCP Tool:** The agent calls `contentrain_merge(branch: "cr/normalize/extract/...", confirm: true)`
- **Git platform:** Create PR → review → merge

## Phase 2: Reuse

Replace hardcoded strings in source files with content references. Start only after Phase 1 is reviewed and merged.

### Step 1. Choose scope

Process one model at a time to keep diffs small:

> "Replace the hero section hardcoded strings with content references"

### Step 2. Determine replacement patterns

The agent determines the correct expression based on your framework:

::: code-group

```vue [Vue / Nuxt]
<!-- Before -->
<h1>Build faster with AI-powered content</h1>

<!-- After -->
<h1>{{ $t('hero.title') }}</h1>
```

```tsx [React / Next.js]
// Before
<h1>Build faster with AI-powered content</h1>

// After
<h1>{t('hero.title')}</h1>
```

```astro [Astro]
---
import { dictionary } from '#contentrain'
const t = dictionary('ui-labels').locale('en').get()
---

<!-- Before -->
<h1>Build faster with AI-powered content</h1>

<!-- After -->
<h1>{t.hero_title}</h1>
```

```svelte [SvelteKit]
<!-- Before -->
<h1>Build faster with AI-powered content</h1>

<!-- After -->
<h1>{$t('hero.title')}</h1>
```

:::

::: info
The agent determines the replacement expression based on your tech stack. MCP only does exact string replacement — it is framework-agnostic.
:::

### Step 3. Preview the patch

The agent runs a dry-run first:

> "Show me what the source file changes will look like"

The agent calls `contentrain_apply(mode: "reuse", scope: { model: "hero-section" }, patches: [...], dry_run: true)` and presents the diff.

### Step 4. Apply the patch

After your confirmation:

> "Apply the reuse patches"

The agent calls `contentrain_apply(mode: "reuse", ..., dry_run: false)`. This patches source files and creates a `contentrain/normalize/reuse/hero-section/{timestamp}` branch.

### Step 5. Validate, submit, and repeat

> "Validate and submit, then move to the next model"

Repeat for each model until all extracted content is referenced in source code.

## Phase 3: Translate

After extraction and reuse are complete, add new languages.

### Step 1. Copy locale

> "Copy all English content to Turkish"

The agent calls:

```
contentrain_bulk({
  operation: "copy_locale",
  model: "ui-labels",
  source_locale: "en",
  target_locale: "tr"
})
```

This creates `tr.json` files with the same keys as `en.json`, values still in English.

### Step 2. Translate

> "Translate all Turkish content, keeping the tone professional"

The agent translates each value while preserving keys, placeholders, and formatting.

### Step 3. Regenerate the SDK client

```bash
npx contentrain generate
```

The application now serves localized content.

## When Studio Enters

Normalize is the wedge, not the final surface.

Use local AI packages first when you need to scan code, extract hardcoded strings, patch source files, and validate everything in git. Move into [Contentrain Studio](/studio) when the same structured content now needs:

- authenticated review and approval
- editor, reviewer, and viewer roles
- web-based media, forms, and conversation workflows
- CDN delivery and API distribution for other clients

The package bridge looks like this:

- `@contentrain/mcp` handles deterministic extract and reuse locally
- `@contentrain/rules` and `@contentrain/skills` keep agent behavior consistent
- `@contentrain/query` consumes the resulting content in apps
- Studio becomes the team-facing web surface on top of the same `.contentrain/` contract

See the full [Ecosystem Map](/ecosystem) and the Studio docs [Ecosystem page](https://docs.contentrain.io/guide/ecosystem).

## SDK Direct Import Pattern

Instead of using an i18n library, you can import content directly via the SDK:

::: code-group

```vue [Vue]
<script setup lang="ts">
import { singleton } from '#contentrain'

const hero = singleton('hero-section').locale('en').get()
</script>

<template>
  <h1>{{ hero.title }}</h1>
  <p>{{ hero.subtitle }}</p>
</template>
```

```tsx [React]
import { singleton } from '#contentrain'

export function Hero() {
  const hero = singleton('hero-section').locale('en').get()
  return (
    <section>
      <h1>{hero.title}</h1>
      <p>{hero.subtitle}</p>
    </section>
  )
}
```

```astro [Astro]
---
import { singleton } from '#contentrain'

const hero = singleton('hero-section').locale('en').get()
---

<h1>{hero.title}</h1>
<p>{hero.subtitle}</p>
```

:::

## Real Example: Normalizing a Vue Landing Page

Here is a complete walkthrough normalizing a Vue 3 landing page.

### Before: hardcoded strings everywhere

```vue
<!-- src/components/LandingHero.vue -->
<template>
  <section class="hero">
    <h1>Build faster with AI-powered content</h1>
    <p>Ship your next project in days, not weeks. Contentrain manages your content so you can focus on code.</p>
    <div class="cta-group">
      <button class="primary">Get started free</button>
      <button class="secondary">View documentation</button>
    </div>
  </section>
</template>
```

### Agent prompt sequence

1. > "Scan my project and find all hardcoded strings in the landing page components"

2. > "Classify them into appropriate models — use a singleton for the hero, a dictionary for button labels"

3. > "Write the normalize plan and open the review UI"

4. After approval in UI: > "Apply the extraction"

5. After merge: > "Now replace the hardcoded strings with vue-i18n references"

6. After merge: > "Copy English content to Turkish and translate it"

### After: clean, manageable content

```vue
<!-- src/components/LandingHero.vue -->
<template>
  <section class="hero">
    <h1>{{ $t('hero.title') }}</h1>
    <p>{{ $t('hero.subtitle') }}</p>
    <div class="cta-group">
      <button class="primary">{{ $t('cta.get_started') }}</button>
      <button class="secondary">{{ $t('cta.view_docs') }}</button>
    </div>
  </section>
</template>
```

Content now lives in `.contentrain/content/marketing/hero-section/en.json`:

```json
{
  "title": "Build faster with AI-powered content",
  "subtitle": "Ship your next project in days, not weeks. Contentrain manages your content so you can focus on code."
}
```

And UI labels in `.contentrain/content/ui/cta-labels/en.json`:

```json
{
  "cta.get_started": "Get started free",
  "cta.view_docs": "View documentation"
}
```

## Why Normalize is the Starting Point

Most developers discover Contentrain through normalize. The pain is immediate and universal:

- You've been vibe-coding with AI for weeks — 50+ generated files, strings everywhere
- The founder asks for Turkish. Or the marketer wants to change the CTA on 12 pages.
- You realize there's no content layer — just hardcoded text in components

Normalize solves this in minutes. And once your content is extracted and structured, the rest of Contentrain's value (SDK queries, i18n, Studio review, CDN delivery) becomes available naturally.

```
normalize → content exists → SDK queries work → i18n is possible → Studio review makes sense
```

::: tip Ready for Team Collaboration?
After extracting content, connect your project to [Contentrain Studio](/studio) for team review, CDN delivery, and collaboration:

```bash
contentrain studio login
contentrain studio connect
```

See [CLI Studio Integration](/packages/cli#connecting-a-repository) for the full setup flow.
:::

## Important Rules

::: warning
- **Always dry-run before apply.** Both extract and reuse require a preview step.
- **Normalize branches always use review mode.** Never auto-merge.
- **Phase 2 requires Phase 1 to be merged.** Content must exist before patching source.
- **Process reuse one model at a time.** Keep diffs small and reviewable.
- **MCP is framework-agnostic.** The agent provides all stack-specific replacement expressions.
- **Do not change component structure.** Only replace string literals with content references.
:::
