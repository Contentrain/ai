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
| `src/views/` | The page templates: `PostView`, `PageView`, `ListView`. |
| `src/layouts/BaseLayout.astro` | Document shell: SEO head, font, skip link, header, footer. |
| `src/components/SEO.astro`, `src/lib/seo.ts` | Title, description, canonical, robots, Open Graph, Twitter, RSS discovery and a JSON-LD graph (WebSite, Organization, BlogPosting, BreadcrumbList, CollectionPage). |
| `src/components/Prose.astro`, `src/styles/wp-blocks.css` | Rich-text bodies: Tailwind Typography plus styles for WordPress block markup (columns, buttons, gallery, cover, media & text, tables, quotes, separators, alignments, preset colors and sizes). |
| `src/components/studio/` | Studio forms and comment threads. |
| `src/styles/global.css` | The one stylesheet. Design tokens are in `@theme`. |
| `redirects` model, `src/lib/redirects.ts` | Old address → new address, edited in Studio. Built as a redirect page per old address and as `_redirects` (Netlify, Cloudflare Pages). A rule whose target is not public is left out. |

Also built: `sitemap-index.xml` (public addresses from the route table, without noindex entries or redirects), `rss.xml`, `robots.txt`,
`404.html` and `/search/` (Pagefind — the index is built after `astro build`,
no server needed).

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
  `:year`, `:month`, `:day`, `:id`) and the site is built with trailing slashes.

## Studio forms and comments

Set `studio` in `src/site.config.ts` to the Studio project that serves the
site's forms and comments:

```ts
studio: { baseUrl: 'https://studio.contentrain.io', projectId: '<project id>' },
```

A page whose `form` field names a model shows that form under its body; a post
with `comments_open` shows its thread. Without the binding both render nothing
and no script is shipped. `src/lib/studio/embed.ts` is the browser client for
Studio's public forms and comments API; its exports are its interface, so knip
does not report the ones this site does not call.

## Fonts and images

Inter (SIL Open Font License, `src/assets/fonts/OFL.txt`) is self-hosted through
Astro's font API, split into latin and latin-ext subsets. Media entries with
known dimensions render through `astro:assets`; add remote image hosts to
`image.domains` in `astro.config.mjs` to have them optimized at build time.
Entries with neither an SEO description nor an excerpt get a description cut
from their body text.

## Gates

`pnpm gates` and `.github/workflows/ci.yml` run the same checks:

1. `astro check` — the `strictest` TypeScript preset.
2. `knip` — no unused files, exports or dependencies.
3. `astro build` + Pagefind.
4. `scripts/check-dist.mjs` — one stylesheet per page, no WordPress runtime,
   JavaScript only where a feature needs it, the SEO files present, and every
   page with a title, language, absolute canonical and valid JSON-LD.
5. Lighthouse CI (`lighthouserc.json`) — performance ≥ 0.95, accessibility,
   best practices and SEO at 1 (SEO is not asserted on the `noindex` 404 and
   search pages).
