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

A lifted region must close what it opens. A split fragment is something a browser silently repairs, so it survives every visual check — and costs a page its layout anyway. Measured on 2026-09-03 with emitter 0.6.1: a page whose chrome was split mid-element scored **36** on layout, against **100** for the same page kept whole. The emitter checks header, footer and body chrome and names the dangling tags in a warning rather than trusting the producer.

## Images

Migrated posts arrive as HTML and render through `set:html`, so Astro's `<Image>` component cannot reach the pictures inside them. The emitted site runs one build-time pass over each page's content instead:

- **Allowed hosts** — the runtime host (where Studio rehosts migrated media) and anything in `options.images.remotePatterns` — are optimized with `astro:assets` `getImage()`: WebP, a `srcset` at 480/768/1024/1600 px (none wider than the width the HTML declares), `width`/`height` inferred so the page does not shift, and a `sizes` default when the image has none. The source's own `srcset` and `sizes` are replaced, or dropped when the optimized image has no `srcset`.
- **An image is optimized only after its host answered 200 with an image** — a HEAD, or a GET where HEAD is refused, with a 10 s timeout and one check per URL per build. Astro downloads remote images later in the build, outside any error handling, so a single 404 would otherwise fail `astro build`; an image that does not answer keeps its original URL. `astro.config.mjs` carries the same list as `image.remotePatterns`, and `sharp` is added to the dependencies.
- **Every image** gets `decoding="async"` and a `loading` hint: the first image on the page eager with `fetchpriority="high"` (usually the largest paint), the rest lazy.
- Existing `loading`, `decoding`, `sizes` and dimensions are kept; SVG, GIF, `data:` URIs and images marked `data-cr-keep` are never re-encoded; an image that fails to optimize keeps its original markup.
- The theme chrome (header, footer, logos) is left exactly as the source had it.

```ts
emitAstroProject({
  ir, content, runtime,
  options: { images: { remotePatterns: [{ hostname: 'media.example.com', pathname: '/uploads' }] } },
})
```

`images: { enabled: false }` emits no image pass.

## SEO

SEO continuity is the reason a migration keeps the source addresses at all, so the emitter owns the head tags that describe a page and renders them per entry in `src/components/Seo.astro`.

| Tag | Source |
|---|---|
| `<title>` | `EmitPost.seo_title` (the title an SEO plugin composed, "Post – Site"), else `EmitPost.title` · `QueryPage.title` · `RouteModel.title`. The entry's own `title` stays its Article headline and last breadcrumb |
| `og:title`, `og:description`, `og:image` | `open_graph` on `EmitPost` or `QueryPage` — share-card values the source set by hand — else the page's title, description and image. `og:image:*` is printed only when the image is `image` itself |
| `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` | `twitter` on `EmitPost` or `QueryPage`, else the Open Graph values; the card is `summary` / `summary_large_image` as given, else by whether there is an image. The template head's `twitter:site` — the site's handle, the same on every page — is kept |
| `description` | `EmitPost.description`, else `excerpt` with markup stripped and cut at a word boundary |
| `canonical`, `og:url` | The address Astro generated (`Astro.url` + `site`), so it cannot disagree with the emitted page. `EmitPost.canonical` overrides |
| Page image (`og:image` / `twitter:image` default) | `EmitPost.image`, else a `featured` entry that is already a path. A bare file name is skipped — only the producer knows where media is served |
| `og:image:width` / `height` / `type` | `image_meta` on `EmitPost` or `QueryPage`, as the producer measured the file. Printed only beside `image` (a `featured` fallback is a different file), and only valid values — positive integer sizes, an `image/…` type |
| `og:site_name` | `ProjectIR.site.title` |
| Structured data graph | One JSON-LD `@graph` per page: `WebPage` (`CollectionPage` on lists) at the built address with `inLanguage`, `isPartOf` → the site's WebSite `@id` when the kept head declares one; `BreadcrumbList` from `EmitPost.breadcrumbs` / `QueryPage.breadcrumbs` (the trail without the page — the emitter appends it at its own address); and on entries the `Article`, `mainEntityOfPage` → that `@id`. Invalid trails are dropped with a warning; no trail, no BreadcrumbList |
| Source structured data | `schema` on `EmitPost` or `QueryPage`: the page's JSON-LD as the source's SEO plugin rendered it (a `@graph` object, a node array or one node). It is printed **instead of** the generated graph, so FAQ, HowTo, Product and the plugin's own WebPage/Article survive. A WebSite `SearchAction` is dropped, and so is every node the kept head already carries — WebSite, Organization, its logo — matched by `@id` as an address (the scheme, the host's case and a slash before `#` do not count). The plugin's graph is the whole of the page's structured data: a plugin graph without a BreadcrumbList prints none, even when `breadcrumbs` is set. Addresses in the graph are printed as given — the migration keeps the source's, so rewrite only what moved (media). A value with no typed node is not printable: that page gets the generated graph, with a warning |
| `hreflang` alternates, `og:locale:alternate` | Entry pages whose content-store entry (`EmitPost.entry`) exists in another locale. Addresses come from each route's own pattern and the post's parameters — what `getStaticPaths` uses — and the language is the page's `lang`. Every page lists itself; `x-default` is the site-default-locale version. An ambiguous address gets none, with a warning. The template page's own hreflang links are removed from the head chrome |
| `og:locale`, `og:locale:alternate` | The page's `lang` in Open Graph's `ll_RR` form (`tr-TR` → `tr_TR`). A language without a region (`en`) has no such form and is left out rather than guessed — give `ProjectIR.site.locales` the region, as WordPress's `<html lang>` carries it |
| Page or post | A route of kind `page` renders its entries as web pages — `og:type` `website`, a `WebPage` node and no Article or `article:*` tags, as WordPress's SEO plugins print a page. Every other entry route renders articles |
| Article publisher | The node the kept head says publishes the site — the WebSite's own `publisher` reference (Yoast and Rank Math write one), else the head's first Organization — named by `@id`, so its logo and profile count. Without one: the site by `ProjectIR.site.title` and address, never an invented logo |
| Article image | An `ImageObject` with width and height when `image_meta` measures the image; the bare URL otherwise |
| Authors | `EmitPost.author_url` — the author's archive page — becomes the Article author's `url`. On that archive, `QueryPage.profile` (`name`, `description`, `image`, `same_as`) makes the page a `ProfilePage` whose `mainEntity` is a `Person` at the page's own address (`#person`), with `sameAs` for http(s) profiles only — the same address the articles name, so an engine reads one person |
| `WebPage` dates | `datePublished` / `dateModified` from `published_at` / `modified_at`, on pages and posts alike |
| `<meta name="robots">` | `noindex` / `nofollow` on `EmitPost` or `QueryPage` (the source page's robots, e.g. Yoast `robots.index`): `noindex`, `nofollow` or `noindex, nofollow`. Neither set, no tag. The template page's own `robots` and `googlebot` tags are removed from the head chrome, so one page's `noindex` cannot spread to every page. Their site-wide settings (Yoast's `max-image-preview:large, max-snippet:-1, max-video-preview:-1`, anything but index/noindex/follow/nofollow/all/none) are kept and printed on every page after the page's own directives |
| `article:*` and Article JSON-LD dates | `EmitPost.published_at` / `modified_at` (ISO 8601 — `dates` holds display strings, which schema.org cannot read) |

::: danger Why the template's own tags are removed
The emitter takes the template page's copies of those tags **out of the head chrome** and names them in a warning. Inheriting them is worse than having none: a whole site canonicalised onto one template post's URL de-indexes itself, and every share card tells the same wrong story.

Everything else the theme put in `<head>` stays — charset, preloads, feeds, icons, verification tokens, and the structured data that describes the site rather than the page.

Page-scoped structured data is every `…Page` and `…Article` type (WebPage, CollectionPage, ProfilePage, NewsArticle, …), `BlogPosting` and `BreadcrumbList`. An SEO plugin writes the site's identity into the **same** `@graph` as those nodes — Yoast and Rank Math put WebSite, Organization, WebPage and BreadcrumbList in one block — so a mixed block is split rather than removed whole: `WebSite` and `Organization` stay, with the nodes they refer to by `@id` (the logo, the person a personal site is published by). A WebSite `SearchAction` is dropped: it points at WordPress search, and a static site has none. JSON-LD that cannot be parsed is left alone rather than guessed at.
:::

Head-only tags that a faithful clone left in the **body** are reported, not removed: the body is page content, `<title>` is legal inside `<svg>`, and cutting into it to fix an invisible tag would break real markup.

Absolute URLs need `site` in `astro.config.mjs`, which the emitter fills from `ProjectIR.site.url`. Without it the canonical link and absolute social URLs are omitted with a warning, rather than pointing at a build host — and the `site` key is left out of the config altogether, because Astro refuses to build with an empty one.

### From a Bridge SEO export

`seoFromRawEntry(blocks, { serving, url })` maps one page's `RawSeo.entries[address]` — what each SEO plugin holds for it — to the fields above (`seo_title`, `description`, `canonical`, `noindex`/`nofollow`, `open_graph`, `twitter`, `schema`), ready to spread into an `EmitPost` or `QueryPage`:

- The serving plugin's block is read (`RawSeo.serving`), else the first of Yoast, Rank Math, AIOSEO and SEOPress that has one.
- Its values come from the block itself when the running plugin rendered it (`resolved`); else from `rendered` — the exporter's own rendering of the plugin's templates (the Bridge's, `rendered_by`), final text whose unrenderable variables are already out of the string and only listed in `unresolved`; else from the stored values. The last two are taken field by field — a value the rendering does not carry falls back to the stored literal. The JSON-LD is the graph the running plugin rendered — from a `resolved` block only; any other block's graph is read node by node — else the schema nodes the exporter rendered (`rendered.schema.graph`, Rank Math), less any node that still holds a template token (a percent-encoded address — a Turkish or CJK slug — is decoded before it is checked, so `%E4%B8%AD` is not read as Rank Math's `%AD%`). Without a rendering, the block's own graph is read the same way, node by node. The home page's blocks, when it lists posts, are `RawSeo.home`; they read the same way.
- Outside a `resolved` block, a string that still holds a template token in the plugin's own syntax (Yoast and SEOPress `%%title%%`, Rank Math `%title%`, AIOSEO's named tags such as `#post_title` — not any `#word`, so a hashtag survives) is dropped so the page's own value falls in; a token is never printed. Literal values are kept.
- Robots come from `robots_served` — what the page actually carried — then `rendered.robots`, then the plugin's setting. The Twitter card is a setting and stays with the block.
- A canonical equal to the page's own `url` is left out; only one that points elsewhere becomes an override.

`options.seo: false` turns all of this off: the source head travels verbatim.

### Sitemap and robots.txt

The sitemap is written by [`@astrojs/sitemap`](https://docs.astro.build/en/guides/integrations-guide/sitemap/) at build time — `sitemap-index.xml` and the sitemaps it names — not computed by the emitter. Only the build knows every address `getStaticPaths` produced; a list worked out here would be a second answer that can disagree with the site. The 404 page is not listed.

`public/robots.txt` allows every crawler and names the sitemap by absolute URL:

```
User-agent: *
Allow: /

Sitemap: https://example.com/sitemap-index.xml
```

Nothing is disallowed. A WordPress `robots.txt` typically keeps crawlers out of `/wp-admin/`; the migrated site has no such path. Without `site.url` there is no sitemap to name — the integration is not added, `robots.txt` carries no `Sitemap:` line (a relative one is invalid), and a warning says so.

A `noindex` page is left out of the sitemap: the emitter computes its address from the route pattern and the entry's parameters (the values `getStaticPaths` builds the page from) and passes the list to `sitemap({ filter })`. This holds with `options.seo: false` too, and a warning then says the producer's head must carry the robots tag.

`options.sitemap: false` leaves out both. It is independent of `options.seo`: a producer that writes its own meta tags has not thereby said it writes its own sitemap.

## Trailing slash

A WordPress site was indexed under its own form of every address — `/hello/` with the default permalinks, `/hello` with a structure that ends without a slash (`RawRouting.trailing_slash`). The migrated site serves and names each page in that form, so no indexed URL turns into a redirect.

| `options.trailingSlash` | Build | Served at | Named as (canonical, og:url, hreflang, sitemap, feed, llms.txt) |
|---|---|---|---|
| `true` (default) | `build.format: 'directory'` — `/hello/index.html` | `/hello/` | `/hello/` |
| `false` | `build.format: 'file'`, `trailingSlash: 'never'` — `/hello.html` | `/hello`: Netlify and Cloudflare Pages serve a file build that way; for Vercel the emitter adds `cleanUrls: true, trailingSlash: false` to `vercel.json` (unless `redirectHost` names another host) | `/hello` |

The page's own address is taken from the one Astro built it at — a file build names it `/hello.html` — and put into the source's form (`pagePath` in the emitted runtime), so the canonical cannot disagree with the page. A permalink structure ending in `.html` (`/%postname%.html`) is not expressible as an Astro route pattern and is reported, like any other unsupported pattern.

## Feed and llms.txt

WordPress serves every site's newest posts as RSS at `/feed/`, and readers, aggregators and newsletter tools subscribe to it; Yoast writes an `llms.txt` that tells a language model what the site holds. The emitter builds both, as Astro endpoints over the data files the entry pages are built from, and names each entry by the address its own page has — the route pattern filled with the entry's parameters — so neither can list a page the site does not build.

| File | What it holds |
|---|---|
| `/feed.xml` (`src/pages/feed.xml.ts`) | RSS 2.0: the 10 newest posts (WordPress's default `posts_per_rss`) of the `posts` collection, newest first by `published_at`, each with its title, address, date, author and description (`description`, else the excerpt). The channel is `ProjectIR.site.title` and `options.siteDescription` |
| `/llms.txt` (`src/pages/llms.txt.ts`) | The [llmstxt.org](https://llmstxt.org) shape: the site's name, `options.siteDescription` as its summary, and a section per collection the site builds entry pages for — posts first, then pages — with the newest 100 links of each. An entry the source kept out of search (`noindex`) is left out |

Both describe the site in its default language (`ProjectIR.site.locales[0]`): a route in another language, and an entry whose `locale` is another, are left out. Both need `site.url`, since they name pages by absolute address; without it neither is built, with a warning.

The feed is built at `/feed.xml`, not at `/feed/`: a static build writes an endpoint at `/feed/` as a file named `feed`, which no host serves at `/feed/`. The theme's head link to the site's main feed (`/feed/`, `/feed/rss2/`, `?feed=rss2`) is pointed at `/feed.xml`, so browsers and readers that discover the feed from a page find the new one. A reader already subscribed to `/feed/` is sent on with a 301 to `/feed.xml`, written like the site's own redirects: in `astro.config` and in the host's redirect file (see **Redirects**), which is what gives it a real status — feed readers do not follow a static redirect page. A `/feed/` rule the source itself holds wins, and no rule is written when the site builds a page at `/feed/`. The site's other feed links in the head are removed, with a warning (see **Archive feeds** below). A feed on another host (FeedBurner, a newsletter tool) is left alone; `www.` and the bare host count as one site.

The feed lists every post, as WordPress's does — a post the source kept out of search included. An entry whose `canonical` points elsewhere is listed at its own address.

`options.feed: false` and `options.llms: false` leave each out.

**Archive feeds.** WordPress serves a feed for every archive page — `/category/news/feed/`, `/tag/x/feed/`, `/author/ada/feed/`. Every dynamic archive route with a query in the site's default language (not its paginated continuation) gets one per page it builds, at `<archive>/feed.xml` (`src/pages/<archive>/feed.xml.ts`): the 10 newest posts that page lists, each at its own address, titled with the page's title. Each archive page links its feed in its head, and `<archive>/feed/` gets a 301 to it in `astro.config` and the host's redirect file, as the main feed does. The feed redirects pass the checks the site's own rules do — none over a page the site builds or a case twin of one, and a source rule for the same address wins — and in a host file with a rule limit they come after the site's own rules, `/feed/` first, so an overflow drops a feed redirect, which the warning counts. The template head's own archive feed link names one term's feed on every page, so it is removed with the other feed links the site does not build (comments, Atom). `options.feed: false` turns these off with the main feed.

## Components and mount points

`<!--@@component:ID@@-->` — in the body chrome or in an entry's content body, via `componentSlot(id)` from `@contentrain/types` — is where a `ComponentDef` renders. The layout imports the component and mounts it at the marker with the placement's variant.

> Emitting a component file alone is not integration. The marker is what puts it on the page.

A marker nobody defined is dropped with a warning; a placement with no marker is warned. Header and footer regions are not mount points.

Components the emitter cannot invent — an ad slot, a related-posts box — become `<cr-component>` placeholders carrying type, source and variants. The marker keeps the spot.

### Regions bound to a query

A theme's "recent posts" block, cloned, freezes on the day of the migration. `ComponentPlacement.query` binds the region to a query instead: the layout reads that query's result set (`EmitContent.queries[id]`) and renders it at the marker, so the block stays current. The result set is rendered the same way a list page renders one — `sections`, else `item_template`.

- **Query not in the content** — the binding is dropped with a warning and the region stays the cloned markup.
- **More than one result set** — warned, and the build stops: a region has no route parameter to choose between them.
- **No `item_template` or `sections`** — warned, and the region renders a plain list of links, as a list page does. Not fidelity, but the items are there; an empty region looks like a list with no posts.

**Runtime components** (`comments`, `form`) get real implementations when you supply `input.runtime`. They are covered in the [Forms & Comments guide](/guides/forms-comments).

What those components say to a visitor comes from the site's `ui-strings` dictionary (`.contentrain/content/site/ui-strings/{locale}.json`), read at build time for the page's language — see [What the thread and the form say](/guides/forms-comments#what-the-thread-and-the-form-say). `UI_STRINGS_MODEL` and `UI_STRING_DEFAULTS` are exported so a producer creates the dictionary the site reads.

## Redirects

`input.redirects` takes the live site's own redirect rules (`RawIR.redirects`). Only rules that map one address to one address are written to `astro.config.mjs` `redirects`:

| Condition | Written when |
|---|---|
| `match` | absent or `url`, and `regex` not set |
| `status` | 301, 302, 307 or 308 (absent = 301) |
| `from` | a site-root path: no query string or fragment, no `[` / `]`, not ending in a file name. Percent-encoding is decoded |
| `to` | a site-root path or an `http(s)` URL |
| address | the migrated site builds no page there, and no earlier rule claims it |

Everything else comes back in `EmitResult.redirects.manual`, each rule with its reason, plus one warning with the count. Those rules have to be set up at the host. A pattern turned into a literal `from` would redirect the wrong address, so the emitter never guesses.

::: warning A redirect on a page's address would erase the page
Astro does not refuse a redirect whose `from` is a page it builds: it writes the redirect over the page and the build reports no error. The emitter therefore keeps the page and returns the rule.
:::

A file-like `from` (`/old.php`) is returned because the directory build writes it as `/old.php/index.html`, which a host does not serve at `/old.php`.

In a static build Astro serves each redirect as an HTML page with a meta refresh, `noindex`, and a canonical link to the target. Those pages stay as the fallback for any host.

### Real HTTP redirects

A static build has no HTTP status, so the emitter also writes the rules into the host's own redirect file, which answers the request before any page is served:

| `options.redirectHost` | File | Note |
|---|---|---|
| `netlify` | `public/_redirects` | Forced (`301!`): Netlify serves an existing file before an unforced rule, and the build writes a fallback page at every redirected path |
| `cloudflare` | `public/_redirects` | Unforced: Cloudflare Pages always follows its redirects, even when an asset matches |
| `vercel` | `vercel.json` `redirects` | `statusCode` per rule; path-to-regexp syntax escaped |
| unset | Netlify `public/_redirects` and `vercel.json` | A Cloudflare Pages site should name its host |

Each path is written percent-encoded, with and without its trailing slash. `EmitResult.redirects.host_files` names the files written. A `from` containing `*` or a `:` segment is a pattern to a host file; it is left to the meta-refresh fallback, with a warning. A rule that differs from a built page only in letter case is returned too: Netlify matches rules case-insensitively, and macOS and Windows file systems cannot hold `/About/` beside `/about/`, so it would be served over the page. Cloudflare Pages and Vercel files stop at 1,000 rules (2,000 entries with both slash forms, their static limit); the rest are named in `EmitResult.redirects.host_over_limit`, with a warning, and keep only the meta-refresh fallback there. Netlify's file has no limit.

**Host-only rules.** `input.hostRedirects` takes rules served only by the host's redirect file, never by `astro.config`, so the build writes no meta-refresh page for them. It is for bulk rules a site does not need as pages: one per WordPress attachment page runs to tens of thousands, and each would become an HTML file in `dist`. They pass the checks `redirects` do (a built page, a case twin, a query string, a pattern, a duplicate) — except the file-name one, since a host file matches `/old.php` itself — and an address the site's own rules or the feed redirects already hold is theirs. In a Cloudflare or Vercel file they come after both, so at the rule limit they are the ones left out. With no fallback page behind them, a host-only rule the host file cannot hold is not served at all: a pattern, or one past a named host's limit (`options.redirectHost` `cloudflare` or `vercel`), comes back in `EmitResult.redirects.manual` with its reason, with one `hostRedirects:` warning. With no host named, the Netlify file holds every rule, so one past `vercel.json`'s limit stays written and is named in `host_over_limit` with its own warning — not served on Vercel; name the host to have it reported as manual. On a host with no redirect file (a plain static server) host-only rules are not served.


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
