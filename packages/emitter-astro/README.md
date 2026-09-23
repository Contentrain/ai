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
| Balance check | A lifted region must close what it opens; a split fragment the browser silently repairs costs a page its layout (measured 2026-09-03 on emitter 0.6.1: one page split mid-element scored 36 on layout, against 100 for the same page kept whole). The emitter checks header, footer and body chrome and names the dangling tags in a warning instead of trusting the producer. |
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
| Runtime components (`comments`, `form`) | With `input.runtime` (`RuntimeBinding`: the provider's origin + project id) these get real implementations: a custom element (`<cr-comments>`, `<cr-form>`) carrying the binding, and a zero-dependency client (`src/lib/embed.ts`) that fetches, renders and submits against the provider's public API — the same contract as `@contentrain/query/cdn`'s `CommentsClient`/`FormsClient`, inlined so the site depends on nothing but Astro. Comments key on the page's entry address (`EmitPost.entry`: model, entry id, locale) and show approved comments only; pending ones live on the provider. A form names its model (`ComponentDef.model`). Honeypot and Turnstile follow the config. No credential is ever emitted. Without a binding, or without a model for a form, the component stays a placeholder and a warning says so. What they say to visitors is content: the `ui-strings` dictionary (`UI_STRINGS_MODEL`, 23 keys in `UI_STRING_DEFAULTS`) at `.contentrain/content/site/ui-strings/{locale}.json` is read at build time for the page's language (`src/lib/ui-strings.ts`), edited in Studio or through MCP, and applied by a rebuild. Missing keys show the English default; a non-English page with no dictionary is reported in the build log, and in the emit report for languages not in `options.uiStrings.locales`. `options.uiStrings.dir` moves the directory. |
| Regions bound to a query | `ComponentPlacement.query` binds a mounted region (a "recent posts" block) to a query, so it stays current instead of freezing as a clone: the layout reads the result set from `EmitContent.queries[id]` and renders it at the marker through `sections`, else `item_template` — the same path a list page takes. A query missing from the content drops the binding (warned; the region stays cloned). More than one result set is warned and stops the build. No item markup is warned and renders a plain list of links, as a list page does — never an empty region. |
| Other components (`src/components/*.astro`) | `<cr-component>` placeholders carrying type/source/variants — the emitter cannot invent an ad slot or a related-posts box; the marker keeps the spot. |
| Images (`src/lib/images.ts`, `src/lib/optimize-images.ts`) | Content bodies are HTML, so `<Image>` cannot reach them; each page's content instead runs one build-time pass. Images on an allowed host — migrated media on the runtime host always, plus `options.images.remotePatterns` — go through `astro:assets` `getImage()` once the host has answered 200 with an image (a HEAD, or a GET where HEAD is refused; 10 s timeout, one check per URL) — Astro downloads the file later in the build, outside any error handling, so an image that 404s would otherwise fail `astro build`: WebP, a `srcset` (480/768/1024/1600, none wider than the width the HTML declares), `width`/`height` inferred, `sizes` when missing. The source's own `srcset`/`sizes` are replaced, or dropped when the optimized image has no `srcset`, so the browser cannot pick the unoptimized variants. Tags are read with quoted `>` allowed, and `src` is entity-decoded (`&amp;`) before use. Every image gets `decoding="async"` and `loading` (the first eager with `fetchpriority="high"`, the rest lazy); existing attributes are respected, SVG/GIF/`data:`/`data-cr-keep` are never re-encoded, and a failed optimization keeps the original. `astro.config.mjs` gets the same `image.remotePatterns`, `sharp` is added. Theme chrome is left as the source had it. `images: { enabled: false }` turns it off. |
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
`<head>` stays — charset, preloads, feeds, icons, verification tokens, and the
structured data that describes the site rather than the page.

Page-scoped structured data is every `…Page` and `…Article` type (WebPage,
CollectionPage, ProfilePage, NewsArticle, …), `BlogPosting` and
`BreadcrumbList` — a breadcrumb names the template page's trail. An SEO plugin
writes the site's identity into the **same** `@graph` as those nodes (Yoast and
Rank Math put WebSite, Organization, WebPage and BreadcrumbList in one block), so
a mixed block is split rather than removed whole: `WebSite` and `Organization`
(and its subtypes) stay, with the nodes they refer to by `@id` — the logo, the
person a personal site is published by — and a page node is never pulled back
in. A WebSite `SearchAction` is dropped, because it points at WordPress search
(`/?s=`) and a static site has none. The warning names what was removed and
what was kept. JSON-LD that cannot be parsed is left alone rather than guessed
at.

| Tag | Source |
|---|---|
| `<title>` | `EmitPost.seo_title` (the title an SEO plugin composed, "Post – Site"), else `EmitPost.title` · `QueryPage.title` · `RouteModel.title`. The entry's own `title` stays its Article headline and last breadcrumb |
| `og:title`, `og:description`, `og:image` | `open_graph` on `EmitPost` or `QueryPage` — share-card values the source set by hand — else the page's title, description and image. `og:image:*` is printed only when the image is `image` itself |
| `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` | `twitter` on `EmitPost` or `QueryPage`, else the Open Graph values; the card is `summary` / `summary_large_image` as given, else by whether there is an image. The template head's `twitter:site` — the site's handle, the same on every page — is kept |
| `description` | `EmitPost.description`, else `excerpt` with markup stripped and cut at a word boundary |
| `canonical`, `og:url` | The address Astro generated (`Astro.url` + `site`), so it cannot disagree with the emitted page. `EmitPost.canonical` overrides |
| Page image (`og:image` / `twitter:image` default) | `EmitPost.image`, else a `featured` entry that is already a path. A bare file name is skipped — only the producer knows where media is served |
| `og:image:width` / `height` / `type` | `image_meta` on `EmitPost` or `QueryPage` — the producer measured the file; the emitter never sees it. Printed only beside `image` (a `featured` fallback is a different file), and only values that are true of an image: positive integer sizes, an `image/…` type |
| `og:site_name` | `ProjectIR.site.title` |
| Structured data graph | One JSON-LD `@graph` per page: `WebPage` (`CollectionPage` on a list) with `@id` = the built address, `inLanguage` = the page `lang`, and `isPartOf` → the site's own WebSite `@id` when the kept head declares one (never an invented WebSite); a `BreadcrumbList` from `EmitPost.breadcrumbs` / `QueryPage.breadcrumbs` — the trail **without** the page, which the emitter appends at its own address; and on entries the `Article`, whose `mainEntityOfPage` is that `@id`. A trail with a crumb lacking a name or a site-root-relative path is dropped, with a warning. No trail, no BreadcrumbList. Without `site` there is no page node, only an entry's Article |
| Source structured data | `schema` on `EmitPost` or `QueryPage`: the page's JSON-LD as the source's SEO plugin rendered it (a `@graph` object, a node array or one node). It is printed **instead of** the generated graph, so FAQ, HowTo, Product and the plugin's own WebPage/Article survive. A WebSite `SearchAction` is dropped, and so is every node the kept head already carries — WebSite, Organization, its logo — matched by `@id` as an address (the scheme, the host's case and a slash before `#` do not count). The plugin's graph is the whole of the page's structured data: a plugin graph without a BreadcrumbList prints none, even when `breadcrumbs` is set. Addresses in the graph are printed as given — the migration keeps the source's, so rewrite only what moved (media). A value with no typed node is not printable: that page gets the generated graph, with a warning |
| `<link rel="alternate" hreflang>`, `og:locale:alternate` | Entry pages whose content-store entry (`EmitPost.entry`) exists in another locale on the site. The address is computed from each route's own pattern and the post's parameters — the values `getStaticPaths` uses — and the language is the page's `lang` (post locale, else route locale, else site default). Every page lists itself; `x-default` is the version in the site's default locale. A post two routes generate, or an entry where two pages claim one language, gets none, with a warning. The template page's own hreflang links are removed from the head chrome |
| `og:locale` | The page's `lang` |
| `<meta name="robots">` | `noindex` / `nofollow` on `EmitPost` or `QueryPage` (the source page's robots, e.g. Yoast `robots.index`): `noindex`, `nofollow` or `noindex, nofollow`. Neither set, no tag. The template page's own `robots` and `googlebot` tags are removed from the head chrome, so one page's `noindex` cannot spread to every page. Their site-wide settings (Yoast's `max-image-preview:large, max-snippet:-1, max-video-preview:-1`, anything but index/noindex/follow/nofollow/all/none) are kept and printed on every page after the page's own directives |
| `article:published_time` / `modified_time`, Article JSON-LD dates | `EmitPost.published_at` / `modified_at` (ISO 8601 — `dates` holds display strings, which schema.org cannot read) |

Absolute URLs need `site` in `astro.config.mjs`, which the emitter fills from
`ProjectIR.site.url`. Without it the canonical link and the absolute social URLs
are omitted, with a warning, rather than pointing at a build host — and the
`site` key is left out of the config altogether, because Astro refuses to build
with an empty one.

Head-only tags that a faithful clone left in the **body** (a browser that closed
`<head>` early puts the template's canonical there) are reported, not removed:
the body is page content and `<title>` is legal inside `<svg>`, so cutting into
it to fix an invisible tag would break real markup. Lift them into the head
chunk, or drop them at capture.

### From a Bridge SEO export

`seoFromRawEntry(blocks, { serving, url })` maps one page's `RawSeo.entries[address]` — what each SEO plugin holds for it — to the fields above (`seo_title`, `description`, `canonical`, `noindex`/`nofollow`, `open_graph`, `twitter`, `schema`), ready to spread into an `EmitPost` or `QueryPage`:

- The serving plugin's block is read (`RawSeo.serving`), else the first of Yoast, Rank Math and AIOSEO that has one.
- A block not marked `resolved` holds stored values: its unrendered templates, in that plugin's own syntax (Yoast `%%title%%`, Rank Math `%title%`, AIOSEO's named tags such as `#post_title` — not any `#word`, so a hashtag survives), are dropped so the page's own values fall in, and its literal values are kept.
- Robots come from `robots_served` — what the page actually carried — and from the plugin's setting only without it.
- A canonical equal to the page's own `url` is left out; only one that points elsewhere becomes an override.

`options.seo: false` turns all of this off: the source head travels verbatim and
the layout prints its own `<title>`, exactly as before.

### Sitemap and robots.txt

The sitemap is written by [`@astrojs/sitemap`](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
at build time — `sitemap-index.xml` and the sitemaps it names — not computed by
the emitter. Only the build knows every address `getStaticPaths` produced; a list
worked out here would be a second answer that can disagree with the site. The
404 page is not listed.

`public/robots.txt` allows every crawler and names the sitemap by absolute URL:

```
User-agent: *
Allow: /

Sitemap: https://example.com/sitemap-index.xml
```

Nothing is disallowed. A WordPress `robots.txt` typically keeps crawlers out of
`/wp-admin/`; the migrated site has no such path. Without `site.url` there is no
sitemap to name — the integration is not added, `robots.txt` carries no
`Sitemap:` line (a relative one is invalid), and a warning says so.

A `noindex` page is left out of the sitemap: the emitter computes its address
from the route pattern and the entry's parameters (the values `getStaticPaths`
builds the page from) and passes the list to `sitemap({ filter })`. This holds
with `options.seo: false` too, and a warning then says the producer's head must
carry the robots tag.

`options.sitemap: false` leaves out both. It is independent of `options.seo`: a
producer that writes its own meta tags has not thereby said it writes its own
sitemap.

## Feed and llms.txt

WordPress serves every site's newest posts as RSS at `/feed/`, and readers, aggregators and newsletter tools subscribe to it; Yoast writes an `llms.txt` that tells a language model what the site holds. The emitter builds both, as Astro endpoints over the data files the entry pages are built from, and names each entry by the address its own page has — the route pattern filled with the entry's parameters — so neither can list a page the site does not build.

| File | What it holds |
|---|---|
| `/feed.xml` (`src/pages/feed.xml.ts`) | RSS 2.0: the 10 newest posts (WordPress's default `posts_per_rss`) of the `posts` collection, newest first by `published_at`, each with its title, address, date, author and description (`description`, else the excerpt). The channel is `ProjectIR.site.title` and `options.siteDescription` |
| `/llms.txt` (`src/pages/llms.txt.ts`) | The [llmstxt.org](https://llmstxt.org) shape: the site's name, `options.siteDescription` as its summary, and a section per collection the site builds entry pages for — posts first, then pages — with the newest 100 links of each |

Both describe the site in its default language (`ProjectIR.site.locales[0]`): a route in another language, and an entry whose `locale` is another, are left out. Both need `site.url`, since they name pages by absolute address; without it neither is built, with a warning.

The feed is built at `/feed.xml`, not at `/feed/`: a static build writes an endpoint at `/feed/` as a file named `feed`, which no host serves at `/feed/`. The theme's head link to the site's main feed (`/feed/`, `/feed/rss2/`, `?feed=rss2`) is pointed at `/feed.xml`, so browsers and readers that discover the feed from a page find the new one. A reader already subscribed to `/feed/` needs a 301 from `/feed/` to `/feed.xml` at the host — feed readers do not follow a static redirect page — and when the source head advertised the feed, the emit says so. The site's other feed links in the head (comments, a category, Atom) name feeds that are not built; they are kept and counted in a warning. A feed on another host (FeedBurner, a newsletter tool) is left alone.

`options.feed: false` and `options.llms: false` leave each out.

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

## Redirects

`input.redirects` takes the live site's own redirect rules (`RawIR.redirects`,
e.g. what the Bridge reads from Redirection, Yoast Premium, Rank Math, Safe
Redirect Manager and `_wp_old_slug`). The emitter writes only rules that are
one address to one address:

- `match` absent or `url`, and not `regex`;
- status 301, 302, 307 or 308 (absent means 301);
- `from` a site-root path with no query string, no `[`/`]`, and not ending in a
  file name (the directory build writes `/old.php` as `/old.php/index.html`,
  which a host does not serve at `/old.php`);
- `to` a site-root path or an `http(s)` URL.

Those go to `astro.config.mjs` `redirects`, sorted by `from`, with the
percent-encoding decoded. Everything else comes back in
`EmitResult.redirects.manual` with its reason, and one warning gives the count:
those rules have to be set up at the host. A pattern turned into a literal
`from` would redirect the wrong address, so the emitter never guesses.

A rule on an address the migrated site builds a page at is not written either;
the page is kept and the rule is returned. Astro does not refuse that pair: it
writes the redirect over the page without an error. Duplicate `from`s keep the
first rule, and a rule that points at its own address is returned.

In a static build Astro serves each redirect as an HTML page with a meta
refresh, `noindex`, and a canonical link to the target. Those pages stay as the
fallback for any host.

A static build has no HTTP status, so the emitter also writes the rules into the
host's own redirect file, which answers the request before any page is served:

| `options.redirectHost` | File | Note |
|---|---|---|
| `netlify` | `public/_redirects` | Forced (`301!`): Netlify serves an existing file before an unforced rule, and the build writes a fallback page at every redirected path |
| `cloudflare` | `public/_redirects` | Unforced: Cloudflare Pages always follows its redirects, even when an asset matches |
| `vercel` | `vercel.json` `redirects` | `statusCode` per rule; path-to-regexp syntax escaped |
| unset | Netlify `public/_redirects` and `vercel.json` | A Cloudflare Pages site should name its host |

Each path is written percent-encoded, with and without its trailing slash.
`EmitResult.redirects.host_files` names the files written. A `from` containing
`*` or a `:` segment is a pattern to a host file; it is left to the meta-refresh
fallback, with a warning. A rule that differs from a built page only in letter case is returned too: Netlify matches rules case-insensitively, and macOS and Windows file systems cannot hold `/About/` beside `/about/`, so it would be served over the page. Cloudflare Pages and Vercel files stop at 1,000 rules (2,000 entries with both slash forms, their static limit); the rest are named in `EmitResult.redirects.host_over_limit`, with a warning, and keep only the meta-refresh fallback there. Netlify's file has no limit.


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
