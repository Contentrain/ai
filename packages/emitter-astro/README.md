# @contentrain/emitter-astro

Open Astro emitter for Contentrain migrations: renders a **`ProjectIR`** (route model, layout families, component variants, query bindings, design tokens — see `@contentrain/types`) plus prepared content into a complete Astro project, returned as a pure file map.

The analysis that *produces* a good ProjectIR is the hard part and lives elsewhere. Rendering one is deliberately boring — which is why this half is open (MIT), portable, and replaceable by community emitters for other frameworks.

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
| SEO (`src/components/Seo.astro`) | Per-page title, description, canonical, Open Graph, Twitter card and Article structured data from the entry; the template page's copies of those tags are taken out of the head chrome and named in a warning. See **SEO** below. |
| Component mount points | `<!--@@component:ID@@-->` in the body chrome or an entry’s content body (`componentSlot(id)` from `@contentrain/types`) is where a `ComponentDef` renders: the layout imports the component and mounts it at the marker, with the placement's variant (`LayoutFamily.components`). A marker nobody defined is dropped with a warning; a placement without a marker is warned; header/footer regions are not mount points. Emitting a component file alone is not integration — the marker is what puts it on the page. |
| Runtime components (`comments`, `form`) | With `input.runtime` (`RuntimeBinding`: the provider's origin + project id) these get real implementations: a custom element (`<cr-comments>`, `<cr-form>`) carrying the binding, and a zero-dependency client (`src/lib/embed.ts`) that fetches, renders and submits against the provider's public API — the same contract as `@contentrain/query/cdn`'s `CommentsClient`/`FormsClient`, inlined so the site depends on nothing but Astro. Comments key on the page's entry address (`EmitPost.entry`: model, entry id, locale) and show approved comments only; pending ones live on the provider. A form names its model (`ComponentDef.model`). Honeypot and Turnstile follow the config. No credential is ever emitted. Without a binding, or without a model for a form, the component stays a placeholder and a warning says so. |
| Other components (`src/components/*.astro`) | `<cr-component>` placeholders carrying type/source/variants — the emitter cannot invent an ad slot or a related-posts box; the marker keeps the spot. |
| Split viewports | With `viewport_strategy: 'split'`, `build:desktop` / `build:mobile` scripts scaffold per-device production. |

Everything content-shaped flows through JSON data files, never through generated template source — determinism and safe escaping fall out of that one rule.

## SEO

SEO continuity is the reason a migration keeps the source addresses at all, so
the emitter owns the head tags that describe a page and renders them per entry:
`<title>`, `description`, `canonical`, Open Graph, Twitter card and — on entry
pages — Article structured data (`src/components/Seo.astro`).

It also **removes the template page's copies of those tags from the head
chrome**, naming them in a warning. Inheriting them is worse than having none: a
whole site canonicalised onto the template post's URL de-indexes itself, and
every share card shows the same wrong story. Everything else the theme put in
`<head>` stays — charset, preloads, feeds, icons, verification tokens, and any
JSON-LD that is not page-scoped (`Organization`, `WebSite`, `BreadcrumbList`).
JSON-LD that cannot be parsed is left alone rather than guessed at.

| Tag | Source |
|---|---|
| `<title>` | `EmitPost.title` · `QueryPage.title` · `RouteModel.title` |
| `description`, `og:description`, `twitter:description` | `EmitPost.description`, else `excerpt` with markup stripped and cut at a word boundary |
| `canonical`, `og:url` | The address Astro generated (`Astro.url` + `site`), so it cannot disagree with the emitted page. `EmitPost.canonical` overrides |
| `og:image`, `twitter:image` | `EmitPost.image`, else a `featured` entry that is already a path. A bare file name is skipped — only the producer knows where media is served |
| `og:site_name` | `ProjectIR.site.title` |
| `og:locale` | The page's `lang` |
| `article:published_time` / `modified_time`, Article JSON-LD dates | `EmitPost.published_at` / `modified_at` (ISO 8601 — `dates` holds display strings, which schema.org cannot read) |

Absolute URLs need `site` in `astro.config.mjs`, which the emitter fills from
`ProjectIR.site.url`. Without it the canonical link and the absolute social URLs
are omitted, with a warning, rather than pointing at a build host.

Head-only tags that a faithful clone left in the **body** (a browser that closed
`<head>` early puts the template's canonical there) are reported, not removed:
the body is page content and `<title>` is legal inside `<svg>`, so cutting into
it to fix an invisible tag would break real markup. Lift them into the head
chunk, or drop them at capture.

`options.seo: false` turns all of this off: the source head travels verbatim and
the layout prints its own `<title>`, exactly as before.

## Binding the runtime later

`src/data/runtime.json` is the only place the binding lives; the components
read `base_url` and `project_id` from it at build time. When the project id is
not known at emit time (a Studio project created after the migration), write
that one file and rebuild — no re-emit is needed, and the component files do
not change.

## Linked terms and Unicode routes

`EmitPost.terms` accepts strings and `{ name, link? }` objects. Joined term marks
print names; repeat blocks expose `item_name` and `item_link`, while `item` keeps
printing the name. The generated TypeScript uses the same union, so the customer
`npm run build` (`astro check && astro build`) accepts linked terms. Literal
Unicode route segments are preserved; traversal segments and malformed
parameters are rejected and reported as skipped routes.


Parameterless collection routes (for example `/about`) must receive exactly one
entry in their named collection. They read that entry directly, retaining the
body and runtime entry address. Missing or ambiguous data fails the Astro build.
Dynamic routes continue to use `getStaticPaths`. Generated tsconfig files exclude
`public`, `dist`, and `node_modules`, so copied WordPress assets are not typechecked.

## Route collisions

WordPress serves posts and pages from the same root and tells them apart in the
database. A static generator cannot, so a posts route at `/:slug*` and a pages
family at `/:slug*` resolve to the same Astro file.

When two routes claim one page path the emitter reports it as a route problem —
naming both route ids, both patterns, the file, and which route's pages would be
lost — and replaces that page with a guard that fails `astro build` with the
same message. On a dynamic path the guard throws from `getStaticPaths`, because
Astro collects paths before it renders and a frontmatter throw would never run;
on a static path it throws from the frontmatter, because exporting
`getStaticPaths` there is itself an error.

This is deliberately not a warning that keeps going. The pages are unrecoverable
at that point — the emitter cannot know which route should own the path — and
the previous behaviour kept the first file and reported a duplicated *file*, so
the producer learned a path had been written twice rather than that a section of
the site was missing. A build that stops is recoverable; a site that quietly
lost its pages is not.

A second claim counts even when both routes would render the same family and
collection: Astro serves one file per path, so one of the two routes does not
exist in the built site, and which one survived is an accident of ordering. Fix
it by giving one route a distinct pattern, or by expanding the narrower one into
literal routes.
