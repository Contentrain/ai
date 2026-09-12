---
title: WordPress Migration
description: "The WordPress → static-site chain end to end: import to RawIR, plan a ProjectIR, emit an Astro project, and gate the result — and which parts of it are open source"
order: 5
slug: migration
---

# WordPress Migration

Moving a WordPress site to a static build is four separate problems, and Contentrain ships three of them as MIT packages.

```
WordPress site
     │
     │  @contentrain/wp-import          ← MIT, in this repo
     ▼
  RawIR  ─────────────────────────────────  what the source said
     │
     │  migration engine                 ← CLOSED SOURCE (Contentrain Migrate)
     ▼
 ProjectIR  ──────────────────────────────  what the new site should be
     │
     │  @contentrain/emitter-astro       ← MIT, in this repo
     ▼
 Astro project
     │
     │  @contentrain/verify              ← MIT, in this repo
     ▼
  pass / fail
```

## Read this before anything else

::: danger The MIT packages do not convert a site for you
The step that turns a `RawIR` into a `ProjectIR` — deciding what the route model is, which layout families exist, where a component belongs, what the design tokens are — is the analysis, and it is **not** in this repository. It runs in Contentrain Migrate, which is a closed-source product.

What the open packages give you is the two ends and the contracts between them: a faithful importer, a boring renderer, and an offline gate. If you supply your own `ProjectIR`, the whole chain runs on MIT code. If you do not, you have an importer and an emitter with a gap between them.

Anyone describing this as "Contentrain automatically converts your WordPress site" is describing the closed product, not these packages.
:::

The boundary is deliberate and it is written into the contracts themselves. From `@contentrain/types`:

> Producers: the WordPress Bridge plugin (GPL, separate repo), REST/WXR importers. Consumers: the migration engine, Studio, and the open Astro emitter.
>
> A GPL plugin writes RawIR; a proprietary service reads it; an MIT emitter consumes ProjectIR. The contract is the only thing they share, so it lives in the one package all of them may depend on.

Every migration document is plain JSON — snake_case keys, no class instances, no functions — because these documents cross process, repository, and license boundaries.

## 1. Know what you can reach

How much of a WordPress site you can read depends entirely on how you reach it, and the difference is not small:

| Rung | Access | Measured field coverage |
|---|---|---|
| `rest_public` | Public REST API | ~34% |
| `rest_auth` | REST + Application Password | ~57% |
| `wxr` | A WXR export file | ~82% |
| `bridge` | The Bridge plugin (GPL, separate repo) | 100% |

Every `RawIR` records the rung that produced it. Two imports of the same site are only comparable if their rungs are — which is also why a `rest_public` import showing fewer fields is **not** evidence that the site is simpler.

A `CapabilityManifest` answers the other half of the question: what the site *uses*. It is evidence-based detection across 23 capability keys — `seo`, `forms`, `comments`, `search`, `analytics`, `consent`, `acf`, `ecommerce`, `redirects`, `i18n`, `scheduling` and the rest — each carrying the plugin it identified and how it was detected (`rest`, `dom`, `headers`, `meta`). `present: true` with evidence beats a silent guess; nothing is inferred from a theme name.

This is the input for the "what happens to X?" conversation, which is a conversation, not a build step.

## 2. Import

The CLI wraps `@contentrain/wp-import` and writes the store to disk:

```bash
# From a WXR export — the highest rung you can reach offline
npx contentrain import export.xml --out ./my-site

# Or over REST, with an Application Password to reach rest_auth
npx contentrain import https://site.example --auth user:app-password
```

| Flag | Effect |
|---|---|
| `--out <dir>` | Target directory (default: current) |
| `--auth <user:password>` | REST Application Password — lifts access to `rest_auth` |
| `--force` | Overwrite an existing `.contentrain/` |
| `--json` | Machine-readable report, for scripting |

It refuses to overwrite an existing `.contentrain/` without `--force`, because a re-import replaces models and content wholesale.

What lands on disk:

- the canonical `.contentrain/` content store
- `entry-source-map.json` — the WP-id → entry-address mapping
- `comments-export.json` — when the source had comments
- an import report, plus warnings

::: warning Read the warnings before you call it a migration
A REST import that hit a page cap, or whose pages partly failed, produces a store that looks exactly like a smaller site. Truncated collections and failed pages are named in the warnings and nowhere else. The same applies to comments referencing posts outside the import.
:::

See [WordPress Import](/packages/wp-import) for multilingual handling, scheduled posts, identity formulas, and the REST limits in detail.

## 3. Plan — the closed step

The migration engine reads the `RawIR` and produces a `ProjectIR`: route model, layout families, component variants, query bindings, design tokens.

This is where the judgement lives — which URL patterns the site actually serves, which pages share a layout, what is chrome and what is content, which repeated block is a component. It is not in this repository.

If you are building your own pipeline, this is the piece you write (or the product you buy). The `ProjectIR` shape is MIT and fully specified in [`@contentrain/types`](/packages/types), so nothing stops you.

## 4. Emit

```ts
import { emitAstroProject, writeEmit } from '@contentrain/emitter-astro'

const result = emitAstroProject({ ir, content, css, runtime })
console.warn(result.warnings)
await writeEmit(result, './out/site')
```

The emitter is deliberately boring: it renders the IR it is handed and never infers anything about WordPress. Read `result.warnings` — that is where it reports a component with no mount point, a lifted region with unbalanced tags, or a runtime component left as a placeholder.

Two of its behaviours matter most at this stage:

- **It removes the template page's SEO tags from the head chrome.** A cloned site that inherits one canonical de-indexes itself. See [SEO](/packages/emitter-astro#seo).
- **A route collision fails the build.** WordPress serves posts and pages from one root; a static generator cannot. Rather than silently dropping a section of the site, the emitter writes a guard that stops `astro build` and names both routes.

## 5. Gate

```bash
npx @contentrain/verify dist --site https://example.com --baseline ./old-pages
```

[`@contentrain/verify`](/packages/verify) checks identity, indexing, status, hreflang, structured data, navigation and assets over the documents you give it.

::: info It does not crawl
`@contentrain/verify` never makes a network request. It takes documents — a `dist/` directory, or pages a capture step already collected — and checks those. A hardened crawler is a security surface of its own, and it belongs where that hardening is maintained rather than inside the MIT library every consumer embeds.

So it will not "scan your live site". Whoever holds a safe fetcher supplies the pages.
:::

The rule for severity is one sentence: **error** means the built site is wrong; **warning** means it is worse than the site it replaced. A run with no baseline, no sitemap and no redirect rules names those absences in `report.skipped` — a green report over a run that compared nothing is the most dangerous output the package could produce.

## 6. Bind the runtime

Forms and comments do not survive a static build on their own. When the emitter is given a `RuntimeBinding`, `<cr-form>` and `<cr-comments>` become real implementations talking to a provider's public API — see [Forms & Comments](/guides/forms-comments).

If the project id does not exist yet, emit without it and write `src/data/runtime.json` later. No re-emit is needed.

## The handoff

`MigrationHandoff` is the document that ends a migration: site URL, repository coordinates, preview URL, a content summary, the detected capabilities, and `offers` — what each capability could be replaced with, including a cost comparison and the honest warning where one applies (*"keeping comments on WordPress means the WordPress server stays live"*).

It is MIT and lives in `@contentrain/types`, so the closed engine, Studio, and any third-party tool agree on what a finished migration looks like.

## How the closed step is held to account

The open packages can be read. The analysis in the middle cannot, so it is worth
saying plainly what it is measured against — not because you have to run any of
this, but because "the engine handles it" is a claim, and a claim needs a
method behind it.

::: info This is not a checklist for your migration
It describes how Contentrain decides the migration engine is ready, not
something you are expected to do. Your own gate is
[`@contentrain/verify`](/packages/verify).
:::

**An unseen cohort.** A host counts as unseen when it appears in no previous
acceptance manifest, is absent from the development corpus, and has never been
carried in any run. The runner checks for contamination before it starts, and
refuses to start if it finds any. Measuring an engine on a site it has already
been taught is not measurement.

**A frozen engine.** For the whole run, the source commit, the working tree, and
a sha256 table of every package's built output are bit-identical before and
after — and nobody changes code or `dist` while a run is open. Freezing is a
digest, not a date: a date says when, a digest says *what*, and only the second
one survives someone rebuilding mid-run.

**A stated denominator.** A site is eligible when discovery finds REST reachable
and standard post data behind it. Sites dominated by custom types, page-only
sites, and access-blocked sites are counted separately rather than folded in —
they are a different problem, and burying them in the denominator would flatter
the result. A site that could not be measured because the network failed leaves
the denominator; it is not recorded as a failure.

Two rates come out of that:

| Rate | Numerator | Denominator |
|---|---|---|
| **Build** | sites that built | eligible sites run |
| **Self-serve** | sites that needed no human intervention at all | eligible sites run |

Self-serve is the one that matters, and it is deliberately unforgiving: the
decision must be ACCEPT with an empty punch list — every target over both the
desktop and the mobile visual-fidelity threshold, content coming from data
rather than baked into a template, the layout family proven general rather than
fitted to one page, zero runtime references left pointing at the old server,
menu behaviour preserved, and the result editable afterwards. One item
outstanding and the site is not self-serve, however good it looks.

Building a site is easy to claim. Building it so that nobody had to touch it
afterwards is the thing being measured.

## Doing this with an agent

The `contentrain-migrate-wordpress` skill drives the open parts of this chain — import, wire the content to a framework, validate. Install it with the rest:

```bash
npx skills add Contentrain/ai/packages/skills --skill contentrain-migrate-wordpress
```

The skill activates on "migrate from WordPress", a WXR export, a REST URL, or connecting imported content to Astro, Nuxt or Next. It does not substitute for the planning step.

## Related Pages

- [WordPress Import](/packages/wp-import) — the importer in detail
- [Astro Emitter](/packages/emitter-astro) — what the renderer emits, and what it refuses to guess
- [Verify](/packages/verify) — every check, with the failure each one catches
- [Forms & Comments](/guides/forms-comments) — runtime components on a static site
- [Types](/packages/types) — `RawIR`, `ProjectIR`, `CapabilityManifest`, `MigrationHandoff`
