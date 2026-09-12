---
title: Astro Emitter
description: "@contentrain/emitter-astro — renders a ProjectIR plus prepared content into a complete Astro project, returned as a pure file map"
order: 8
slug: emitter-astro
---

# Astro Emitter

[![npm version](https://img.shields.io/npm/v/@contentrain/emitter-astro)](https://www.npmjs.com/package/@contentrain/emitter-astro)

`@contentrain/emitter-astro` takes a **`ProjectIR`** — route model, layout families, component variants, query bindings, design tokens — plus prepared content, and returns a complete Astro project as a pure file map.

## Why this half is open

The analysis that *produces* a good `ProjectIR` is the hard part, and it lives elsewhere. Rendering one is deliberately boring.

That is exactly why this half is MIT: a boring, portable renderer can be read, forked, and replaced. A community emitter for Next.js, SvelteKit or Eleventy consumes the same `ProjectIR` and owes nothing to the analysis that produced it.

::: info What this package does not do
It does not look at a WordPress site, and it cannot infer a route model from one. It renders the IR it is given. See [WordPress Migration](/guides/migration) for what produces that IR and which part of that chain is closed source.
:::

## Install

```bash
pnpm add @contentrain/emitter-astro
```

## Usage

```ts
import { emitAstroProject, writeEmit } from '@contentrain/emitter-astro'

const result = emitAstroProject({
  ir,
  content,
  css,
  // Where runtime components (comments, forms) talk to. Optional: without it
  // they are emitted as placeholders and each one is named in the warnings.
  runtime: { base_url: 'https://studio.contentrain.io', project_id: 'proj_…' },
})

console.warn(result.warnings)
await writeEmit(result, './out/site')
```

The emitter returns a file map and a warning list. **Read the warnings** — they are where it tells you that a component had no mount point, that a lifted region did not close its tags, or that a runtime component stayed a placeholder.

## The one rule

> Everything content-shaped flows through JSON data files, never through generated template source.

Determinism and safe escaping both fall out of that. Theme markup travels as **data** (`src/data/chrome/*.json`) injected with `set:html`, so the Astro compiler never parses a WordPress theme's HTML — which it would reject, or worse, silently reinterpret.

## What it emits

| Piece | How |
|---|---|
| Layouts (`src/layouts/*.astro`) | One per `LayoutFamily`. `@@mark@@` placeholders — title, author, `date{n}`, `term{n}`, `feat{n}`, slug — are filled per page |
| Pages (`src/pages/…`) | From `RouteModel` patterns. `single` routes render post bodies; list routes render items through the extracted `item_template`. Pagination is a route param, never a separate family |
| Header & footer | `ChromeChunk.position` lifts the masthead and colophon out of the body blob into shared components. Families carrying the same region share **one** component — that is where a jQuery-free menu replaces the theme's, in one place. Identity is by content: two different headers claiming one name get separate files and a warning, never a silent swap |
| Nested addresses | A trailing `*` makes a rest parameter — `/category/:term*` → `[...term].astro`, so `/category/about-cc/events/` keeps its hierarchy instead of collapsing to its last segment |
| Route parameters | Each post carries its own (`EmitPost.params`), so a dated permalink (`/:year/:month/:day/:slug`) generates every post at its real address and redirects stay unnecessary |
| Per-page CSS | `EmitPost.css` / `QueryPage.css` load only what a page needs; the family's `css.files` is the shared union |
| Root attributes | `LayoutFamily.root_attrs` lands on `<html>` / `<body>` verbatim. Themes key container rules off `wp-singular`, `single`, `js`, `wf-…`; dropping them costs a correct-content page its whole layout |
| Legacy CSS | Quarantined in `@layer legacy { … }` with leading `@import`s hoisted and layered |
| Evolution layer | `src/styles/modern.css` — Tailwind 4, CSS-first, extracted design tokens in `@theme`. Migrated layouts never load it; new pages build on it |
| Split viewports | With `viewport_strategy: 'split'`, `build:desktop` / `build:mobile` scripts scaffold per-device production |

### Template markers

| Marker | Renders |
|---|---|
| `@@mark@@` | A value, escaped |
| `@@mark_html@@` | Raw — for themes printing a post's own markup |
| `<!--@@repeat:list\|sep@@-->…<!--@@/repeat@@-->` | Once per item, exposing `item`, `item_index`, `item_<key>` |
| `<!--@@if:name@@-->…<!--@@/if@@-->` | Conditionally; `if:!name` inverts |

Rendering order is repeats → conditionals → marks.

### The balance check

A lifted region must close what it opens. A split fragment is something a browser silently repairs, so it survives every visual check — and costs a page its layout anyway. Measured: **36 pages out of 100**. The emitter checks header, footer and body chrome and names the dangling tags in a warning rather than trusting the producer.

## SEO

SEO continuity is the reason a migration keeps the source addresses at all, so the emitter owns the head tags that describe a page and renders them per entry in `src/components/Seo.astro`.

| Tag | Source |
|---|---|
| `<title>` | `EmitPost.title` · `QueryPage.title` · `RouteModel.title` |
| `description`, `og:description`, `twitter:description` | `EmitPost.description`, else `excerpt` with markup stripped and cut at a word boundary |
| `canonical`, `og:url` | The address Astro generated (`Astro.url` + `site`), so it cannot disagree with the emitted page. `EmitPost.canonical` overrides |
| `og:image`, `twitter:image` | `EmitPost.image`, else a `featured` entry that is already a path. A bare file name is skipped — only the producer knows where media is served |
| `og:site_name` | `ProjectIR.site.title` |
| `og:locale` | The page's `lang` |
| `article:*` and Article JSON-LD dates | `EmitPost.published_at` / `modified_at` (ISO 8601 — `dates` holds display strings, which schema.org cannot read) |

::: danger Why the template's own tags are removed
The emitter takes the template page's copies of those tags **out of the head chrome** and names them in a warning. Inheriting them is worse than having none: a whole site canonicalised onto one template post's URL de-indexes itself, and every share card tells the same wrong story.

Everything else the theme put in `<head>` stays — charset, preloads, feeds, icons, verification tokens, and any JSON-LD that is not page-scoped (`Organization`, `WebSite`, `BreadcrumbList`). JSON-LD that cannot be parsed is left alone rather than guessed at.
:::

Head-only tags that a faithful clone left in the **body** are reported, not removed: the body is page content, `<title>` is legal inside `<svg>`, and cutting into it to fix an invisible tag would break real markup.

Absolute URLs need `site` in `astro.config.mjs`, which the emitter fills from `ProjectIR.site.url`. Without it the canonical link and absolute social URLs are omitted with a warning, rather than pointing at a build host.

`options.seo: false` turns all of this off: the source head travels verbatim.

## Components and mount points

`<!--@@component:ID@@-->` — in the body chrome or in an entry's content body, via `componentSlot(id)` from `@contentrain/types` — is where a `ComponentDef` renders. The layout imports the component and mounts it at the marker with the placement's variant.

> Emitting a component file alone is not integration. The marker is what puts it on the page.

A marker nobody defined is dropped with a warning; a placement with no marker is warned. Header and footer regions are not mount points.

Components the emitter cannot invent — an ad slot, a related-posts box — become `<cr-component>` placeholders carrying type, source and variants. The marker keeps the spot.

**Runtime components** (`comments`, `form`) get real implementations when you supply `input.runtime`. They are covered in the [Forms & Comments guide](/guides/forms-comments).

## Route collisions fail the build

WordPress serves posts and pages from the same root and tells them apart in the database. A static generator cannot, so a posts route at `/:slug*` and a pages family at `/:slug*` resolve to the same Astro file.

When two routes claim one page path, the emitter reports it — naming both route ids, both patterns, the file, and which route's pages would be lost — and replaces that page with a guard that fails `astro build` with the same message. On a dynamic path the guard throws from `getStaticPaths`, because Astro collects paths before it renders; on a static path it throws from the frontmatter.

::: warning This is deliberately not a warning that keeps going
At that point the pages are unrecoverable — the emitter cannot know which route should own the path. The earlier behaviour kept the first file and reported a duplicated *file*, so the producer learned a path had been written twice rather than that a section of the site was missing.

A build that stops is recoverable. A site that quietly lost its pages is not.
:::

A second claim counts even when both routes would render the same family and collection: Astro serves one file per path, so one of the two routes does not exist in the built site, and which one survived is an accident of ordering. Fix it by giving one route a distinct pattern, or by expanding the narrower one into literal routes.

## Binding the runtime later

`src/data/runtime.json` is the only place the runtime binding lives; components read `base_url` and `project_id` from it at build time. When the project id is not known at emit time — a Studio project created after the migration — write that one file and rebuild. No re-emit, and the component files do not change.

## Related Pages

- [WordPress Migration](/guides/migration) — the chain this package ends
- [Forms & Comments](/guides/forms-comments) — the runtime components in detail
- [Verify](/packages/verify) — checks the emitted site over its own documents
- [WordPress Import](/packages/wp-import) — the other open end of the pipeline
- [Types](/packages/types) — `ProjectIR`, `LayoutFamily`, `RouteModel`, `ComponentDef`
