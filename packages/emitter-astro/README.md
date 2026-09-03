# @contentrain/emitter-astro

Open Astro emitter for Contentrain migrations: renders a **`ProjectIR`** (route model, layout families, component variants, query bindings, design tokens — see `@contentrain/types`) plus prepared content into a complete Astro project, returned as a pure file map.

The analysis that *produces* a good ProjectIR is the hard part and lives elsewhere. Rendering one is deliberately boring — which is why this half is open (MIT), portable, and replaceable by community emitters for other frameworks.

## Usage

```ts
import { emitAstroProject, writeEmit } from '@contentrain/emitter-astro'

const result = emitAstroProject({ ir, content, css })
console.warn(result.warnings)
await writeEmit(result, './out/site')
```

## What it emits

| Piece | How |
|---|---|
| Layouts (`src/layouts/*.astro`) | One per `LayoutFamily`. Chrome travels as **data** (`src/data/chrome/*.json`) injected via `set:html` — the Astro compiler never parses theme markup. `@@mark@@` placeholders (title, author, `date{n}`, `term{n}`, `feat{n}`, slug) are filled per page. |
| Pages (`src/pages/…`) | From `RouteModel` patterns: `single` routes render post bodies; list routes render items through the extracted `item_template` (plain fallback list + warning when absent). Pagination is a route param, never a separate family. |
| Template markers | `@@mark@@` (escaped) · `@@mark_html@@` (raw, for themes printing a post's own markup) · `<!--@@repeat:list|sep@@-->…<!--@@/repeat@@-->` (per item, with `item` / `item_index` / `item_<key>`) · `<!--@@if:name@@-->…<!--@@/if@@-->` (and `if:!name`). Rendered repeats → conditionals → marks. |
| Header & footer | `ChromeChunk.position: 'header' \| 'footer'` lifts the masthead and the colophon out of the body blob into `src/components/*.astro`, rendered as siblings of the body fragment. Families that carry the same region share ONE component — that is where a jQuery-free menu replaces the theme's, in one place. Identity is by content: two different headers claiming the same name get separate files and a warning, never a silent swap. |
| Balance check | A lifted region must close what it opens; a split fragment the browser silently repairs costs a page its layout (measured: 36 against 100). The emitter checks header, footer and body chrome and names the dangling tags in a warning instead of trusting the producer. |
| Nested addresses | A trailing `*` makes a rest parameter — `/category/:term*` → `[...term].astro`, so `/category/about-cc/events/` keeps its hierarchy instead of collapsing to its last segment. Same for nested page paths. |
| List sections | `QueryPage.sections` renders a list as a sequence of blocks — a big card in its own wrapper, then a grid — instead of forcing one template on every item (or baking the hero into the chrome, which puts the wrong post on page 2). `item_template` stays the single-section shorthand. |
| Titles & language | `QueryPage.title` / `RouteModel.title` give archive and static pages a real `<title>`; `RouteModel.locale` (and `EmitPost.locale`) put each route's own language on `<html lang>`, so a multilingual site's second language is a route with its own family and query — not a workaround. |
| Collections | `RouteModel.collection` names the content a per-entry route generates from (`EmitContent.collections`); `single` defaults to `posts`. Pages and custom post types get their own routes and their own data files. |
| Route parameters | Each post carries its own (`EmitPost.params`) — a dated permalink (`/:year/:month/:day/:slug`) generates every post at its real address, so redirects stay unnecessary. |
| Per-page CSS | `EmitPost.css` / `QueryPage.css` load stylesheets only that page needs (page-builder sites emit CSS per page); the family's `css.files` is the shared union. |
| Root attributes | `LayoutFamily.root_attrs` lands on `<html>`/`<body>` verbatim — themes key their container rules off `wp-singular`, `single`, `js`, `wf-…`; dropping them costs a correct-content page its whole layout. Values may carry `@@marks@@` (per-page classes like `postid-123`). |
| Legacy CSS (`public/styles/legacy/`) | Quarantined in `@layer legacy { … }` with leading `@import`s hoisted and layered; a mid-file `@import` is left as-is with a warning. |
| Evolution layer (`src/styles/modern.css`) | Tailwind 4, CSS-first: extracted design tokens land in `@theme`. Migrated layouts never load it; new pages build on it. |
| Components (`src/components/*.astro`) | `<cr-component>` placeholders carrying type/source/variants; `runtime`-sourced ones point to the migration handoff offers. |
| Split viewports | With `viewport_strategy: 'split'`, `build:desktop` / `build:mobile` scripts scaffold per-device production. |

Everything content-shaped flows through JSON data files, never through generated template source — determinism and safe escaping fall out of that one rule.
