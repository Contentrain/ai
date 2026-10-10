# Contentrain Astro starter

A static Astro site whose content lives in [Contentrain](https://contentrain.io):
models and entries in `.contentrain/`, edited in Contentrain Studio, read by the
site only through `@contentrain/query`. It is the base every WordPress migration
starts from, and it passes all of its own gates with no content at all.

```bash
pnpm install
pnpm dev         # http://localhost:4321
pnpm gates       # astro check → knip → build + search index → built-site checks
pnpm lhci        # Lighthouse CI on the built site
```

## How it fits together

| Where | What |
|---|---|
| `.contentrain/models/` | The content models: `site` (singleton), `posts`, `pages`, `categories`, `tags`, `authors`, `media`, `menus`, `menu-items`, and the `ui-strings` dictionary. |
| `src/content.config.ts` | One Astro collection per model, loaded with `contentrainLoader` and validated by a schema that mirrors the model. Public builds show published entries only. |
| `src/site.config.ts` | What is not content: permalink patterns, the front page, posts per page, menu slugs and the Studio binding. |
| `src/lib/site-routes.ts`, `src/pages/[...path].astro` | The route table. Every content address — posts, pages, the posts index, category/tag/author archives and their `/page/N/` pages — comes from the permalink patterns. Two entries claiming one address fail the build. |
| `src/lib/links.ts` | Links to what the public can see: menu targets, body links and section links resolve through the route table; a link to a draft, a private page or the source site's old address is dropped or rewritten. |
| `src/views/` | The page templates: `PostView`, `PageView`, `ListView`. A migration adds composed pages (`views/composed/`) and the overlays every page draws after the footer, such as a popup (`views/overlays/`); both are empty by default. |
| `src/layouts/BaseLayout.astro` | Document shell: SEO head, font, skip link, header, footer. |
| `src/components/SEO.astro`, `src/lib/seo.ts`, `src/lib/share.ts` | Title, description, canonical, robots, Open Graph, Twitter, RSS discovery and a JSON-LD graph (WebSite, Organization, BlogPosting, BreadcrumbList, CollectionPage). `<title>` follows `titleTemplate`; link previews show the page's own words: `og:title` is `seo.og_title`, else `seo.title`, else the page title without the site suffix; `og:description` is `seo.og_description`, else the meta description. |
| `src/components/Prose.astro`, `src/styles/wp-blocks.css` | Rich-text bodies: Tailwind Typography plus styles for WordPress block markup (columns, buttons, gallery, cover, media & text, tables, quotes, separators, alignments, preset colors and sizes). |
| `src/components/studio/` | Studio forms and comment threads. |
| `src/styles/global.css` | The one stylesheet. Design tokens are in `@theme`. |
| `public/_headers` | Response headers (Netlify, Cloudflare Pages): an SVG under `/media/` opened on its own runs no script and loads nothing (CSP `default-src 'none'`, `sandbox`, `nosniff`). |
| `redirects` model, `src/lib/redirects.ts` | Old address → new address, edited in Studio. Built as a redirect page per old address and as `_redirects` (Netlify, Cloudflare Pages). A rule whose target is not public is left out. |

### Old addresses on your host

WordPress answers query addresses — `/?p=12`, `/?page_id=7`, `/?cat=3`,
`/?tag=news`, `/?author=2` — on every site, and a site with plain permalinks
has no others. A static page cannot answer a query, so the build covers them
three ways:

- **`_redirects`** (Netlify): `/ p=12 /hello-world/ 301`, a real 301.
  Cloudflare Pages reads the same file but cannot match a query; the lines
  are ignored there.
- **The home page** carries a small inline map and sends a browser that
  arrives with one of those queries on with `location.replace` — works on any
  host, but it is not a 301, so search engines give it less weight than a
  host rule. Without JavaScript the home page shows as usual.
- **`/wp-query-map.json`**: the same map, for a host's own rules or a check.

On Vercel, add the rules to `vercel.json` (`has: [{ type: 'query', … }]`)
from `/wp-query-map.json`; Vercel reads its config before the build, so the
build cannot write it for you.

Also built: `sitemap-index.xml` (public addresses from the route table, without noindex entries or redirects), `rss.xml`, `robots.txt`,
`llms.txt` (llmstxt.org: the site's name, tagline and newest pages of each kind, absolute links, no noindex entries; only with a `site` address),
`404.html` and `/search/` (Pagefind — the index is built after `astro build`,
no server needed).

## Publishing: your host and Studio

The site is static: `pnpm build` writes `dist/`, which any static host serves.
Where it lives is yours to choose; the move sets nothing up on a host.

1. **Connect this repository to your host** — Netlify, Vercel or Cloudflare
   Pages — and let it build from your default branch with `pnpm build` and
   `dist` as the output directory. Every push to that branch publishes.
2. **Changes approved in Studio arrive on that branch.** Studio merges a
   reviewed change into its `contentrain` branch, then moves your default
   branch forward, so a host that builds from the repository publishes it
   without anything more.
3. **Add a deploy hook in Studio** for what no push announces: a scheduled
   publish or expiry passing, or a host that does not watch the repository.
   Create the hook at your host —
   [Netlify build hooks](https://docs.netlify.com/configure-builds/build-hooks/),
   [Vercel deploy hooks](https://vercel.com/docs/deploy-hooks),
   [Cloudflare Pages deploy hooks](https://developers.cloudflare.com/pages/configuration/deploy-hooks/)
   — then paste its URL in Studio: your project's CDN panel, **Deploy Hook**.
   Studio calls it after content is published and when a scheduled time
   passes.

To check it once: approve a small change in Studio and look for it on the
live site.

To build part of the site, list its addresses in `CONTENTRAIN_ROUTES`
(`CONTENTRAIN_ROUTES=/,/about/ pnpm build`): only those content pages are
built, while redirects, the feeds, the sitemap and search stay as they are.
An address the site does not have stops the build. This is meant for a
preview; a site you publish builds without it.

## Conventions

- **Content only through the loader.** No page reads `.contentrain/` files or
  imports JSON content; everything goes through `astro:content`.
- **One stylesheet, tokens first.** Components use color roles
  (`surface`, `ink`, `ink-muted`, `line`, `accent`) and the width tokens, never
  raw values, so a brand is a change to `@theme`.
- **No JavaScript by default.** The mobile menu is a `<details>` element. The
  only scripts are search (on `/search/`) and the Studio form and comments
  mounts (only on pages that render one).
- **Interface text is content.** Every label the site prints comes from the
  `ui-strings` dictionary, in the site's language; a missing key shows the key.
- **Addresses are kept.** Permalinks follow WordPress tokens (`:slug`, `:path`,
  `:year`, `:month`, `:day`, `:id`, and `:category` for posts) and the site is
  built with trailing slashes. `:category` is WordPress's `%category%`: the
  post's primary category (`primary_category`, from Yoast or Rank Math), else
  its category with the lowest term ID, with its parents (`news/local`); a post
  with none takes `siteConfig.defaultCategory` (default `uncategorized`).
  `:year`, `:month` and `:day`, and every printed date, are read in
  `siteConfig.timeZone` (an IANA name or a `±hh:mm` offset; absent, UTC), as
  WordPress fills them from the post's local date: a post written in the
  evening of a UTC−n site keeps its address and its day.

## Studio binding: forms, comments and media

`studio.json` at the project root binds the site to its Contentrain Studio
project. Studio writes it when it moves the site's media (Migration → Media);
you can also write it by hand. It is plain JSON, safe for tools to write:

```json
{ "baseUrl": "https://studio.contentrain.io", "projectId": "<project id>" }
```

A Studio that serves media from a CDN host of its own adds `"mediaBaseUrl"`,
the project's delivery base (`https://cdn.example/api/cdn/v1/<project id>`).

`astro.config.mjs` reads it at build time (`CONTENTRAIN_STUDIO_URL` and
`CONTENTRAIN_STUDIO_PROJECT` override it; with either set, the file's
`mediaBaseUrl` is ignored, since it belongs to the file's project) and:

- allows the project's media in `image.remotePatterns`
  (`<mediaBaseUrl>/media/**`, by default `<baseUrl>/api/cdn/v1/<projectId>/media/**`), so images an editor uploads
  in Studio are resized with a `srcset` like the ones in `public/`;
- hands the binding to the site as `siteConfig.studio`, which turns on forms
  and comments.

Without the file the site builds as usual: Studio images are shown as they
are, and forms and comments fall back as described below.

A page whose `form` field names a model shows that form under its body; a post
with `comments_open` shows its thread. The form's fields (the model's public
fields, labels and select options) are in the page HTML, and the script puts
Studio's live form in their place. Without the binding, a form shows the
address the source site published to write to (`features.email`); with none,
its place says so (`data-state="needs_endpoint"`: the fields as text and "This
form needs Studio or a form endpoint to receive messages"), never a form that
vanishes. A form goes to the WordPress site only when the owner chose it
(`features.forms.home: 'wordpress'`): a line saying where it is sent and a live
link there.

Comments a migration carried are drawn at build time from
`src/data/comments.json` (`src/lib/comments.ts`): per entry, the approved
comments as display name, date and plain text, threaded, with no email, IP or
avatar. Inside the Studio mount they are the page's thread until Studio answers,
which replaces them, and they stay when it cannot (an error, an inactive
subscription). Unbound, they show on their own. A thread closed at the source,
or with `comments_open` off, shows read-only with "Comments are closed". With
neither Studio nor a carried thread, nothing renders and no script is shipped. `src/lib/studio/embed.ts` is the browser client for
Studio's public forms and comments API; its exports are its interface, so knip
does not report the ones this site does not call.

## Fonts and images

Inter (SIL Open Font License, `src/assets/fonts/OFL.txt`) is self-hosted through
Astro's font API, split into latin and latin-ext subsets. Media entries with
known dimensions render through `astro:assets`; add remote image hosts to
`image.domains` in `astro.config.mjs` to have them optimized at build time.
Entries with neither an SEO description nor an excerpt get a description cut
from their body text; a page with none of these — an archive, a posts page,
an empty page — gets one from its name and the site's name and tagline
("Author: Ada – Northwind. Fresh bread daily."), with its number on a later
page of a list.

## Gates

`pnpm gates` and `.github/workflows/ci.yml` run the same checks:

1. `astro check` — the `strictest` TypeScript preset.
2. `knip` — no unused files, exports or dependencies.
3. `astro build` + Pagefind.
4. `scripts/check-dist.mjs` — one stylesheet per page, no WordPress runtime,
   JavaScript only where a feature needs it, the SEO files present, and every
   indexable page with a title, meta description, language, absolute canonical
   and valid JSON-LD.
5. Lighthouse CI (`lighthouserc.json`, three runs per page, the median
   counts) — accessibility, best practices and SEO at 1 (SEO is not asserted
   on the `noindex` 404 and search pages); performance under 0.95 is a
   warning, not a failure: a shared CI runner's timing varies from run to run,
   and a red check should mean the site has a fault.
