# @contentrain/emitter-astro

## 0.18.4

### Patch Changes

- Updated dependencies [334852f]
- Updated dependencies [951af8c]
- Updated dependencies [2578366]
  - @contentrain/types@1.26.0

## 0.18.3

### Patch Changes

- Updated dependencies [3eb5832]
- Updated dependencies [36e5773]
- Updated dependencies [01c0065]
- Updated dependencies [9121e22]
  - @contentrain/types@1.25.0

## 0.18.2

### Patch Changes

- Updated dependencies [53505cd]
  - @contentrain/types@1.24.0

## 0.18.1

### Patch Changes

- c659098: The emitted `src/lib/embed.ts` type-checks under `exactOptionalPropertyTypes` (Astro's `strictest` preset): a comments mount without `data-locale` leaves `locale` out of its entry address instead of setting it to `undefined`. Same request on the wire.
- Updated dependencies [d87121b]
- Updated dependencies [90b5049]
  - @contentrain/types@1.23.0

## 0.18.0

### Minor Changes

- 4a846b2: Only published entries are built. `EmitPost.status` and `publish_at` (the entry's `EntryMeta`) hold back drafts, entries in review, rejected or archived ones, and posts scheduled for later (`publish_at` after `options.now`, default the emit time); `EmitPost.visibility` other than `public` (password-protected or private) is never built, whatever its status. None of them gets a page, sitemap line, feed item, llms.txt link, list card or hreflang alternate. A published page's link to a held-back entry is kept as its text, and a redirect to one is returned in `redirects.manual`. `EmitResult.withheld` lists the held-back entries and the unlinked links. Content without a status, `publish_at` or `visibility` is emitted as before; `options.requireStatus: true` holds back every entry that carries no status instead (fail closed), with a warning.

### Patch Changes

- 85a85c1: The chrome balance check no longer reports every `script`, `style`, `textarea` or `title` as never closed when text such as a Turkish `İ` comes before it. It looked for the closing tag in a lowercased copy of the fragment, and lowercasing `İ` adds a code unit, so the index it found pointed past the real closing tag. It now searches the fragment itself, matching the tag name by ASCII case as HTML does.
- b9b8b00: The emitted `package.json` lists `@astrojs/check` and `typescript` under `dependencies`, not `devDependencies`. The site's `build` script runs `astro check`, and an install with `NODE_ENV=production` (a worker image, a host's production build) leaves devDependencies out: Astro then asks to install the checker, so with no terminal the build fails, and with `CI` set `astro check` exits 0 without checking anything.

## 0.17.0

### Minor Changes

- 932f33b: `EmitInput.hostRedirects`: rules served only by the host's redirect file (`public/_redirects`, `vercel.json`), never by `astro.config`, so the static build writes no meta-refresh page for them — for bulk rules such as one per WordPress attachment page. Same checks as `redirects`; the site's own rules and the feed redirects win a shared address and come first in a limited host file. A host-only rule the host file cannot hold (a pattern, past the Cloudflare/Vercel limit) is returned in `EmitResult.redirects.manual`.

### Patch Changes

- 2a027a5: A host-only rule (`hostRedirects`) is never written over a file the build writes — robots.txt, llms.txt, a feed, the sitemap files, 404.html, `/_astro/`, `/styles/` (either slash form, any letter case): a host file answers before the filesystem, so it would shadow the file. Such a rule is returned in `EmitResult.redirects.manual`.

## 0.16.1

### Patch Changes

- 8441656: Fix the build of every site with an archive route (category, tag, author): the archive page passed its `feed` to the layout's `seo` object, which `SeoInput` did not declare, so `astro check` — which the build runs first — failed with TS2353. `SeoInput` now carries `feed`.

## 0.16.0

### Minor Changes

- 9909194: The Bridge's rendered SEO (BR-16, `contentrain-bridge-seo@1`, additive). `RawSeoEntry` gains `rendered` (title, description, canonical, robots, Open Graph and Twitter text as the exporter rendered the plugin's templates), `rendered_by`, `template_source` and `unresolved`; `SEO_PROVIDERS` gains `seopress` (optional in `RawSeo.providers`, so older exports stay valid). `seoFromRawEntry()` reads a resolved block as it is, else `rendered`, else the stored values with template tokens dropped; robots from `robots_served`, then `rendered.robots`, then the setting; a template token is never printed.

### Patch Changes

- 250fe5e: `RawSeo.home` holds the home page's SEO, one block per provider, when the home page lists posts. `seoFromRawEntry()` reads a block's top-level JSON-LD graph only when the running plugin rendered it (`resolved`); otherwise it reads the exporter's rendered schema nodes and leaves out any node that still holds a template token, so a `%title%` never reaches the page's structured data.
- Updated dependencies [9909194]
- Updated dependencies [250fe5e]
  - @contentrain/types@1.22.0

## 0.15.0

### Minor Changes

- c985235: Every archive page gets its feed, as in WordPress: a category, tag or author page builds `<archive>/feed.xml` with the newest posts it lists, links it in its head, and `<archive>/feed/` gets a 301 to it. The template head's own archive, comments and Atom feed links — one page's, or not built — are removed from the chrome.
- ef99df6: Authors as one person across the site. `EmitPost.author_url` (the author's archive) becomes the Article author's `url`; `QueryPage.profile` makes the author's archive a `ProfilePage` whose main entity is a `Person` at that same address, with bio, image and `sameAs`.
- 7e351a8: The migrated site builds an RSS feed and an llms.txt. `/feed.xml` carries the 10 newest posts, as WordPress serves them at `/feed/`, the theme's head link to the main feed now points at it, and `/feed/` gets a 301 to it in `astro.config` and the host's redirect file. `/llms.txt` lists the site's name, tagline (`options.siteDescription`) and the newest 100 pages of each collection, leaving out those kept out of search. Both are endpoints over the entry pages' own data, so each entry keeps its page's address. `options.feed: false` and `options.llms: false` turn them off.
- 0e0d20b: Page-level signals as the source's SEO plugin stated them. A route of kind `page` renders web pages (`og:type` `website`, a `WebPage` node, no Article); the Article's publisher is the node the site's head declares, by `@id`, so its logo counts; `og:locale` is written as `ll_RR` and left out for a language without a region; a measured Article image is an `ImageObject`; the `WebPage` node carries `datePublished` / `dateModified`.
- 4d677b6: Optimized images for migrated content.

  Post bodies render as HTML (`set:html`), so `<Image>` never reached the pictures inside them. Each page's content now runs one build-time pass (`src/lib/optimize-images.ts`):

  - Images on an allowed host go through `astro:assets` `getImage()`: WebP, a width-capped `srcset`, inferred `width`/`height`, and a default `sizes`. Allowed hosts are the runtime host, where migrated media is rehosted, plus `options.images.remotePatterns`.
  - Every image gets `decoding="async"`. The first image is eager with `fetchpriority="high"`; the rest are lazy.
  - Existing attributes are respected. SVG, GIF and `data:` images are never re-encoded, and a failed optimization keeps the original.

  The same host list lands in `astro.config.mjs` as `image.remotePatterns`, and `sharp` is added to the dependencies. Theme chrome is untouched. `options.images.enabled: false` turns the pass off.

- a4c3cf5: noindex: `EmitPost.noindex` / `nofollow` and `QueryPage.noindex` / `nofollow` print `<meta name="robots">` on the page, and noindex pages are left out of the sitemap through a `sitemap({ filter })` built from their addresses. The template page's `robots` and `googlebot` tags are removed from the head chrome, so one page's noindex no longer spreads to every page.
- 68ff510: Redirects: `EmitInput.redirects` (the site's `RawIR.redirects`) writes plain one-to-one rules (301/302/307/308) to `astro.config` `redirects`. Patterns, regular expressions, other statuses, query-string or file-name `from`s, and rules on an address the migrated site builds a page at come back in `EmitResult.redirects.manual` with the reason, to set up at the host. The rules are also written as real HTTP redirects into the host's file (`options.redirectHost`: Netlify `public/_redirects` forced, Cloudflare Pages `public/_redirects`, Vercel `vercel.json`; unset writes Netlify and Vercel), with the meta-refresh pages as the fallback; `EmitResult.redirects.host_files` names them.
- 983adbe: Per-page SEO the source's plugin set now survives the migration. `EmitPost.seo_title` is the page's `<title>` (the entry's `title` stays the Article headline and last breadcrumb); `open_graph` and `twitter` on `EmitPost` and `QueryPage` override the derived share-card tags; `schema` carries the plugin's JSON-LD graph (FAQ, HowTo, Product) and is printed instead of the generated one, without the WebSite `SearchAction` or the nodes the head already carries. The template head's `twitter:site` is now kept. `seoFromRawEntry()` maps a Bridge `RawSeo` entry to these fields.
- e11d69b: `options.trailingSlash: false` keeps the addresses of a site whose permalinks end without a slash. The build writes files (`/hello.html`, served at `/hello`) with Astro's `trailingSlash: 'never'`, `vercel.json` gets `cleanUrls`, and the canonical, og:url, hreflang, sitemap, feed and llms.txt all name each page `/hello` — the form the source was indexed under. The default (`/hello/`) is emitted as before.

### Patch Changes

- 096a0a5: The emitted forms and comments runtime handles Studio's `402 payment_required`: the widget empties and hides itself, whether loading, submitting or loading more comments, shows the visitor nothing, doesn't retry, and leaves one `console.debug` note for the workspace owner. `EmbedError` now carries the API's `data.code`, and `isPaymentRequired()` checks it. Other failures are shown as before.
- Updated dependencies [10c9b85]
  - @contentrain/types@1.21.0

## 0.14.5

### Patch Changes

- Updated dependencies [fbb651c]
  - @contentrain/types@1.20.0

## 0.14.4

### Patch Changes

- Updated dependencies [93ab71d]
  - @contentrain/types@1.19.1

## 0.14.3

### Patch Changes

- Updated dependencies [c069c67]
  - @contentrain/types@1.19.0

## 0.14.2

### Patch Changes

- Updated dependencies [ae0b3ec]
  - @contentrain/types@1.18.1

## 0.14.1

### Patch Changes

- Updated dependencies [568a319]
- Updated dependencies [39a1de7]
- Updated dependencies [8e0331f]
- Updated dependencies [d44e030]
- Updated dependencies [d09cb72]
- Updated dependencies [ff9095e]
  - @contentrain/types@1.18.0

## 0.14.0

### Minor Changes

- c3a3a5b: Multilingual sites get hreflang. An entry page whose content-store entry (`EmitPost.entry`) exists in another locale prints `<link rel="alternate" hreflang>` for every translation, itself included, an `x-default` for the site's default locale, and `og:locale:alternate`. Addresses are computed from each route's pattern and the post's own parameters — the values `getStaticPaths` hands Astro — and a page's language is its `lang` (post locale, else route locale, else site default), so producers write nothing new. A post generated by two routes, or an entry where two pages claim one language, gets no alternates and a warning, since its address would be a guess.

  The template page's hreflang links are now removed from the head chrome: carried over, they pointed every page at the template's translations. RSS `rel="alternate"` links are kept.

- b39ae28: Social images carry their size and type. `EmitPost.image_meta` and `QueryPage.image_meta` (`ImageMeta`: `width`, `height`, `type`) print `og:image:width`, `og:image:height` and `og:image:type`, so a share card lays out at the right aspect on first fetch. The producer supplies the measurements — the emitter never sees the file. They are printed only beside `image`, never for a `featured` fallback (a different file), and only when true of an image: positive integer sizes and an `image/…` MIME type.
- 54c4c46: A migrated site keeps its site-wide structured data. SEO plugins write WebSite and Organization into the same JSON-LD `@graph` as the page's own WebPage, Article and BreadcrumbList, and the emitter removed any block with a page-scoped node whole — taking the site's identity with it. A mixed block is now split: WebSite and Organization (and the nodes they reference by `@id`, such as the logo) stay in the head chrome, the page nodes go, and the warning names both. A WebSite `SearchAction` is dropped, since it points at WordPress search.

  Page-scoped types now include every `…Page` and `…Article` subtype and `BreadcrumbList`. An archive template's CollectionPage, or a breadcrumb naming the template page's trail, used to stay on every page.

- c3c0cc4: Emitted projects get a sitemap and a `robots.txt`. The sitemap comes from `@astrojs/sitemap` at build time, so it lists exactly the pages the build produced (the 404 page is not among them); `public/robots.txt` allows every crawler and names `sitemap-index.xml` by absolute URL. Without `site.url` the integration is left out, `robots.txt` carries no `Sitemap:` line, and a warning says so. `options.sitemap: false` turns both off, independently of `options.seo`.

  A project emitted without `site.url` now builds: `astro.config.mjs` used to carry `site: ""`, which Astro rejects as an invalid URL.

- ee1c363: A generated site's comments and forms speak the site's language, and their text is content. Every label, button and message they show — 23 keys, the `<noscript>` notices included — is read at build time from the `ui-strings` dictionary in the site's store (`.contentrain/content/site/ui-strings/{locale}.json`) for the page's language, so it is edited in Studio or through MCP and applied by a rebuild, with no re-emit. It used to be English in the emitted code, changeable only by editing TypeScript.

  Missing keys show the English default. A non-English page with no dictionary, or a dictionary missing keys, is reported once in the build log; at emit time, page languages not declared in `options.uiStrings.locales` are named in the warnings. `options.uiStrings.dir` moves the directory (project-relative; anything else is refused). `UI_STRING_DEFAULTS`, `UI_STRINGS_MODEL` and `UI_STRINGS_DIR` are exported so a producer creates exactly the dictionary the site reads. Mounted components now receive the page's `lang`.

- d6c3549: Every page describes itself in structured data. The Seo component prints one JSON-LD `@graph`: a `WebPage` (`CollectionPage` on list pages) whose `@id` is the address Astro built, with `inLanguage` and — when the head chrome kept the site's own WebSite node — `isPartOf` pointing at that node's `@id`; a `BreadcrumbList` when the producer supplies a trail; and on entry pages the `Article`, now linked to the page by `mainEntityOfPage: { "@id" }` instead of repeating an inline WebPage.

  `EmitPost.breadcrumbs` and `QueryPage.breadcrumbs` take the trail to the page, the page itself excluded: the emitter appends it at its own address, so the last crumb cannot disagree with the page. Every crumb needs a name and a site-root-relative path; a trail with one that does not is dropped and counted in the warnings. Without a trail there is no BreadcrumbList, and nothing is derived from the URL. The structured data is built by `pageStructuredData` in the emitted runtime.

### Patch Changes

- b47805e: A site that mounts a comments thread or a form builds again. The layout passes `html` to every mounted component since regions can be bound to a query, but the comments and form components did not declare it, so `astro check` — which the generated build runs first — failed with a type error on the mount and the build never started. Both components now accept it, and a test checks that every mountable component declares every prop the layout passes.
- a8f3d2b: A region bound to a query whose result set has no `item_template` or `sections` rendered an empty string, with no warning: the block disappeared from every page. It now renders the same plain list of links a list page falls back to, and the emitter warns, as `QueryPage.item_template` documents. List pages and regions render a result set through one runtime function (`renderQueryPage`), so they cannot drift apart again. An empty `sections` array no longer hides an `item_template` next to it.
- d6c3549: Render disjoint collections that share the same catchall route through one Astro page, selecting each entry's original layout and locale. Keep the original data files and dynamic entry discovery. Duplicate URLs still refuse emission or fail the next build after content edits; static and non-collection route collisions remain errors.
- Updated dependencies [197a568]
- Updated dependencies [bb8dbe1]
  - @contentrain/types@1.17.0

## 0.13.0

### Minor Changes

- 346acbb: A page region can be bound to a query instead of frozen as a clone

  A theme's "recent posts" block sits in the chrome of every article. Cloned, it
  freezes on the day of the migration: it keeps listing the same posts forever and
  nobody notices, because it still looks right. Measured across a blind cohort,
  nine post families across eight sites carried one.

  `ComponentPlacement.query` names a `QueryBinding`, and the emitter fills that
  region from the query's results — the difference between a copy of a site and a
  site, because the block stays current _and_ becomes editable.

  On the placement rather than on `ComponentDef`, because it is a per-mount fact:
  one `related` component can be mounted by a post family filtered to the post's
  category and by an author family filtered to the author. The definition says
  what the region _is_; the placement says what it shows here — the same split
  `variant` and `selector` already follow.

  **The layout resolves the data, not the component.** A component file is shared
  by id across families while a placement belongs to one, so two families binding
  the same component to different queries could not both be served by a single
  file. The layout imports the query, renders it, and passes the markup to the
  mount; the component keeps a `html` prop and its placeholder to fall back to, so
  the region stays editable in one place while staying current from another.

  Exactly one result set is expected. A list _page_ maps each to a route; a region
  has no route parameter to choose between them, so more than one is a build error
  rather than a guess — picking the first would silently render one category's
  posts under every category. The emitter warns at emit time and the generated
  `renderQuery` throws at build time.

  A binding whose query is not in `input.content.queries` is dropped with a
  warning and the region stays the cloned markup, rather than emitting an import
  of a data file nobody wrote.

### Patch Changes

- Updated dependencies [346acbb]
  - @contentrain/types@1.16.0

## 0.12.1

### Patch Changes

- Updated dependencies [897834b]
  - @contentrain/types@1.15.0

## 0.12.0

### Minor Changes

- 63c9d2b: A route collision fails the build instead of silently dropping a section of the site

  WordPress serves posts and pages from the same root and tells them apart in the
  database. A static generator cannot, so a posts route at `/:slug*` and a pages
  family at `/:slug*` resolve to one Astro file. The emitter kept the first and
  warned `duplicate file with different content: src/pages/[...slug].astro —
keeping the first`.

  Two things were wrong with that. Every page of the second route disappeared, and
  the message named a _file_, so a producer learned a path had been written twice
  rather than that a section of its site was missing. On one measured site the
  pages were being rendered by the post template and scoring below zero, and the
  warning did not match the run gate's `route … skipped` pattern, so nothing
  caught it.

  Now a second claim on a page path is reported as what it is — `route r-pages:
pattern "/:slug*" emits the same Astro page as route r-posts ("/:slug*") —
src/pages/[...slug].astro. Every page of "r-pages" would be dropped …` — and
  that page is replaced with a guard carrying the same message, so `astro build`
  stops. The pages are unrecoverable either way: the emitter cannot know which
  route should own the path. A build that stops is recoverable; a site that
  quietly lost its pages is not.

  The guard throws from `getStaticPaths` on a dynamic path, because Astro collects
  paths before it renders and a frontmatter throw would never run — the build
  would fail on the missing `getStaticPaths` with Astro's generic message instead
  of the one naming the two routes. On a static path it throws from the
  frontmatter, because exporting `getStaticPaths` there is itself an error.

  A collision counts even when both routes would render the same family and
  collection: Astro serves one file per path, so one of the two routes does not
  exist in the built site and which one survived is an accident of ordering. The
  generic `duplicate file` warning no longer fires for `src/pages/**`, where it
  would only bury the specific one.

  Verified end to end: a generated project with two `/:slug*` routes fails
  `astro build` with exit code 1 and the collision message verbatim.

### Patch Changes

- Updated dependencies [520f60f]
- Updated dependencies [2fae9fb]
  - @contentrain/types@1.14.0

## 0.11.0

### Minor Changes

- 463297e: Per-page SEO: the emitter owns the head tags that describe a page

  A migrated page inherited the template page's head verbatim, so every post
  carried the template's `<link rel="canonical">`, its `og:title` and its Article
  JSON-LD — and the emitter added nothing of its own. That is worse than having
  none: a whole site canonicalised onto one URL de-indexes itself, and every
  share card shows the same wrong story. SEO continuity is the reason a migration
  keeps the source addresses at all.

  `src/components/Seo.astro` now renders, per page, `<title>`, `description`,
  `canonical`, Open Graph, Twitter card and — on entry pages — Article structured
  data, from `EmitPost` / `QueryPage` / `RouteModel` and the configured site. The
  canonical address comes from `Astro.url` and `site` rather than from data, so it
  is by construction the address Astro generated. New optional fields:
  `description`, `image`, `canonical`, `published_at`, `modified_at` on `EmitPost`;
  `description`, `image`, `canonical` on `QueryPage`.

  The template's copies of exactly those tags leave the head chrome, named in a
  warning. Everything else the theme put in `<head>` stays, including JSON-LD that
  is not page-scoped (`Organization`, `WebSite`, `BreadcrumbList`) and any JSON-LD
  that cannot be parsed. Without `site.url` the canonical link and absolute social
  URLs are omitted with a warning instead of pointing at a build host; a `featured`
  entry that is a bare file name is not used as `og:image`, because only the
  producer knows where media is served.

  Head-only tags a clone left in the body chrome (the template's canonical, when
  the source browser closed `<head>` early) are reported rather than removed:
  `<title>` is legal inside `<svg>`, so cutting into page content to fix an
  invisible tag would break real markup.

  `options.seo: false` restores the previous behaviour exactly.

  Verified on a generated project with a Yoast-style theme head:
  `astro check && astro build` clean, and every page carries exactly one canonical
  and one title, each its own.

### Patch Changes

- Updated dependencies [463297e]
  - @contentrain/types@1.13.1

## 0.10.0

### Minor Changes

- 37b0159: Per-page SEO: the emitter owns the head tags that describe a page

  A migrated page inherited the template page's head verbatim, so every post
  carried the template's `<link rel="canonical">`, its `og:title` and its Article
  JSON-LD — and the emitter added nothing of its own. That is worse than having
  none: a whole site canonicalised onto one URL de-indexes itself, and every
  share card shows the same wrong story. SEO continuity is the reason a migration
  keeps the source addresses at all.

  `src/components/Seo.astro` now renders, per page, `<title>`, `description`,
  `canonical`, Open Graph, Twitter card and — on entry pages — Article structured
  data, from `EmitPost` / `QueryPage` / `RouteModel` and the configured site. The
  canonical address comes from `Astro.url` and `site` rather than from data, so it
  is by construction the address Astro generated. New optional fields:
  `description`, `image`, `canonical`, `published_at`, `modified_at` on `EmitPost`;
  `description`, `image`, `canonical` on `QueryPage`.

  The template's copies of exactly those tags leave the head chrome, named in a
  warning. Everything else the theme put in `<head>` stays, including JSON-LD that
  is not page-scoped (`Organization`, `WebSite`, `BreadcrumbList`) and any JSON-LD
  that cannot be parsed. Without `site.url` the canonical link and absolute social
  URLs are omitted with a warning instead of pointing at a build host; a `featured`
  entry that is a bare file name is not used as `og:image`, because only the
  producer knows where media is served.

  Head-only tags a clone left in the body chrome (the template's canonical, when
  the source browser closed `<head>` early) are reported rather than removed:
  `<title>` is legal inside `<svg>`, so cutting into page content to fix an
  invisible tag would break real markup.

  `options.seo: false` restores the previous behaviour exactly.

  Verified on a generated project with a Yoast-style theme head:
  `astro check && astro build` clean, and every page carries exactly one canonical
  and one title, each its own.

## 0.9.2

### Patch Changes

- 4ddf24c: Preserve distinct translation groups when their canonical posts share a slug. Existing non-colliding entry identities remain unchanged; colliding groups receive deterministic WP-id identities. Reject translation groups that collapse to one normalized locale instead of silently overwriting a translation.

  Render parameterless collection routes directly from exactly one content entry, with an explicit build error for missing or ambiguous data. Exclude public assets and dependencies from generated Astro typechecking to prevent legacy WordPress JavaScript from exhausting the build heap.

  WordPress `future` posts preserve publication intent as published metadata gated by `publish_at`. Undated scheduled posts fail import. Public consumers must honor the publication window rather than checking status alone.

  The migrate skill's mapping reference carried the old `future` → `draft` answer; a parity test now runs the importer and holds the status table to what it actually writes.

## 0.9.1

### Patch Changes

- Updated dependencies [c1f1984]
  - @contentrain/types@1.13.0

## 0.9.0

### Minor Changes

- be46e34: Migration readiness: what the first real WordPress run through the pipeline asked for

  **Emitter — `EmittedPost.terms` accepts `{ name, link }` (customer-visible fix).**
  A theme whose term list links each term feeds a repeat block objects, and the
  emitted `fill.ts` typed `terms` as `string[]` — `astro build` passed but the
  generated project's own `npm run build` (`astro check && astro build`) failed
  on the page that reads the data. `terms` is now `Array<string | { name, link? }>`;
  `term{n}` and `terms` marks print the name either way, repeat blocks read
  `item_name` / `item_link`, and `postMarks` normalizes strings so a template
  written for names keeps working when the producer starts sending objects.

  **Emitter — component markers inside content bodies mount too.** A contact
  form usually lives in a page's `post_content`, not in the chrome. A
  `<!--@@component:ID@@-->` marker found in a post body now enters the mount
  table of the family that renders that collection, so the layout imports the
  component and mounts it at the marker exactly as it does for chrome markers.
  A body marker with no definition is warned once per family. Route literals may
  carry Unicode; `.` / `..` segments are rejected.

  **Emitter docs — `src/data/runtime.json` can be rewritten alone.** Components
  read the binding from that file only, so binding a project id later needs no
  re-emit.

  **Types — `ModelDefinition.form` / `.comments`, `MODEL_EXTENSION_KEYS`.** The
  runtime provider's public form and comments settings live in the model file;
  the content engine carries them verbatim. `MODEL_FIELD_ORDER` places them last.

  **MCP — `contentrain_model_save` preserves `form` and `comments`.** The tool
  rebuilt the definition from its own input, so an agent adding one field
  silently switched a live contact form off. Existing blocks are carried forward
  on update and named in `preserved_blocks`. `contentrain_validate` accepts a
  model file that carries them (it already did; now tested).

  **wp-import — `concurrency` and `maxPages` on `fetchRestRawIR`.** All pages of
  every collection were requested in one `Promise.all` (~150 simultaneous
  requests on a mid-size site). One pool now bounds requests across collections
  (default 4, slot held until the body is consumed), `maxPages` caps each
  collection and names what was skipped, failed pages are warned rather than
  dropped silently. `SKIP_TYPES` gains GeneratePress / GenerateBlocks / Elementor
  template types and Contact Form 7 / WPForms form definitions — design, not
  content. ACF field records stay: their cross-model parents are part of the
  lossless import.

  **Rules & skills — schema, MCP-usage and mapping references name the preserved blocks and the newly skipped post types** (the parity tests hold the docs to the code).

### Patch Changes

- Updated dependencies [be46e34]
  - @contentrain/types@1.12.0

## 0.8.1

### Patch Changes

- ceff6a2: Public-API fixtures are byte-for-byte copies of Studio's wire fixtures; root comments send `parentId: null`

  The forms/comments fixtures had been derived from the docs examples and
  carried values that never appear on the wire (dictionary keys instead of
  dictionary text, a real-looking `statusMessage` where Nitro sends "Server
  Error", validation messages that are the validator's free text). They are
  now copies of Studio's `tests/fixtures/public-api` with Studio as the owner;
  tests branch on `field` and `statusCode`, never on message text. Both the
  SDK `CommentsClient` and the emitted embed runtime now send `parentId: null`
  explicitly for a root comment, as Studio's own request fixture does.

## 0.8.0

### Minor Changes

- adf26c1: Runtime components are mounted and wired, not merely emitted

  Comments and forms used to come out as `<cr-component>` placeholder files that
  nothing imported. Now a `<!--@@component:ID@@-->` marker in the body chrome is
  a mount point: the family layout imports the component, splits the rendered
  chrome at the marker (`splitComponents` in the emitted `fill.ts`) and renders
  the component there with the placement's variant. Single pages hand the layout
  their entry address (`EmitPost.entry`), and it travels to every mounted
  component.

  With `input.runtime` (`RuntimeBinding`), `comments` and `form` components get
  real implementations: `<cr-comments>` / `<cr-form>` custom elements carrying
  the binding, plus `src/lib/embed.ts` — a zero-dependency browser client of the
  provider's public forms and comments API (the same contract as
  `@contentrain/query/cdn`), rendering the thread, the reply form and the model's
  exposed fields, with honeypot and Turnstile per config. Only approved comments
  render; pending ones stay on the provider. No credential is emitted.

  Without a binding, or a form without a model, the component stays a
  placeholder and a warning names it. A marker with no definition is dropped
  with a warning; a placement with no marker is warned; header/footer chrome is
  not a mount point. `src/data/runtime.json` carries the binding.

  The emitted runtime is executed by this package's tests from disk against the
  same request/response fixtures the SDK clients are tested with, and compiled
  by tsc under Astro's strict settings, so what ships is what was verified.

### Patch Changes

- Updated dependencies [adf26c1]
  - @contentrain/types@1.11.0

## 0.7.0

### Minor Changes

- b4724a1: Header and footer chrome as shared Astro components

  `ChromeChunk.position` gains `header` and `footer`, which lift a region out of
  the body blob into `src/components/*.astro` rendered as siblings of the body
  fragment. Families carrying the same region share one component, so the nav
  lives at a single address — where a jQuery-free menu replaces the theme's —
  instead of being copied into every family's chrome. Identity is by content:
  two different headers claiming the same name get separate files and a warning,
  never a silent swap. `ChromeChunk.component` names the shared component.

  The producer must lift only balanced regions that sit outside the content path;
  when either is in doubt one `body` chunk is always correct. The emitter now
  checks balance on header, footer and body chrome and names the dangling tags,
  because an unbalanced fragment does not fail the build — the browser repairs it
  and the page loses its layout (measured: 36 against 100).

### Patch Changes

- b4724a1: Emitted projects pass `astro check`, which their own build runs first

  Two deterministic failures, both found by building an emitted project rather
  than reading it:

  - Pages inferred their data type from the JSON file, so a site whose posts
    need no extra route parameters produced a type without `params` and
    `astro check` rejected the page that reads it. The emitted runtime now
    declares `EmittedPost` / `EmittedQueryPage` and pages assert the contract.
    The cast sits inside `getStaticPaths`, which Astro hoists above the
    component scope.
  - A list route without a title emitted `page.title ?? "" ?? ''`, which
    `astro check` rejects as never nullish. The fallback chain is built in the
    emitter now.

- Updated dependencies [b4724a1]
  - @contentrain/types@1.10.0

## 0.6.1

### Patch Changes

- Updated dependencies [487a061]
  - @contentrain/types@1.9.1

## 0.6.0

### Minor Changes

- 68f4582: List sections, page titles, and per-route language.

  - **List sections** (`QueryPage.sections`, `LIST_ITEMS_SLOT`): a list renders as a sequence of blocks — a big card in its own wrapper, then a grid — each with its own template and item count. One template per list forced every item into the big-card shape (a measured category page scored 56), and baking the big card into the chrome puts the wrong post on page 2. `item_template` remains the single-section shorthand, and a sectioned list no longer triggers the fallback warning.
  - **Page titles** (`QueryPage.title`, `RouteModel.title`): archive, paginated and static pages emit a real `<title>` instead of an empty one.
  - **Per-route language** (`RouteModel.locale`, `QueryBinding.locale`, `EmitPost.locale`): the emitted layout takes `lang` as a prop and each route passes its own, so a multilingual site is a route + family + query per language instead of a second collection workaround.

### Patch Changes

- Updated dependencies [68f4582]
  - @contentrain/types@1.9.0

## 0.5.0

### Minor Changes

- 4079160: Nested addresses and multiple content collections.

  - **Rest parameters:** a trailing `*` in `RouteModel.pattern` (`/category/:term*`) emits `[...term].astro`, so hierarchical taxonomy and nested page addresses (`/category/about-cc/events/`) keep their full path instead of collapsing to the last segment and breaking every nested link. A rest parameter that is not the final segment is warned about (Astro matches them greedily).
  - **Per-route collections:** `RouteModel.collection` names the content a per-entry route generates from, and `EmitContent.collections` carries it. Previously every `single` route wrote `src/data/posts.json`, so a second content type (pages, custom post types) collided with the first. Any route naming a collection is collection-driven — pages and CPTs are per-entry routes too — and an empty collection warns by name.

### Patch Changes

- Updated dependencies [4079160]
  - @contentrain/types@1.8.0

## 0.4.0

### Minor Changes

- b92140a: Template markers for the shapes real themes need, and per-post route/CSS data.

  - **Raw-HTML marks** (`@@mark_html@@`, `RAW_MARK_SUFFIX`): themes that print a post's full content or a link-bearing excerpt inside a list card no longer get escaped markup as text (measured on one category page: 48.6). Escaping stays the default.
  - **Repeat blocks** (`<!--@@repeat:list|sep@@-->…<!--@@/repeat@@-->`, `SlotBinding.repeat`): term and author lists whose length varies per post render correctly — fixed `term0…termN` marks left stray separators (`"Business,"`, `"Releases, Events,"`, `"Automattic, ,"`).
  - **Conditional blocks** (`<!--@@if:name@@-->`, `SlotBinding.optional`): regions that only some posts of the same route render (a featured block; measured spread 3.5–84.5) can now be expressed — route-parameter variants could not.
  - **Per-post route parameters** (`EmitPost.params`, new `post_year`/`post_month`/`post_day`/`post_id` param sources): dated permalinks generate every post at its real address instead of reusing the template post's date.
  - **Per-page stylesheets** (`EmitPost.css`, `QueryPage.css`): page-builder sites emit CSS per page; the family's `css.files` is documented as the union of its members.
  - **Page-level marks** (`QueryPage.marks`): list chrome can show a term's display name where the route parameter only has its slug.
  - Generated `build` script runs `astro check` before `astro build`.

### Patch Changes

- Updated dependencies [b92140a]
  - @contentrain/types@1.7.0

## 0.3.0

### Minor Changes

- ca62ade: Carry the source page's root attributes. `LayoutFamily.root_attrs` (new `RootAttrs`) holds the `<html>` and `<body>` attributes; the emitter writes them onto the generated page and fills `@@marks@@` inside attribute values (per-page classes like `postid-123`). Themes hang layout on those classes — a page with perfect content and empty root attributes loses its entire layout (measured on one corpus site: 36.4 vs 100, while another site was unaffected, so they are carried always). An explicit `lang` from the source wins over the project default.

### Patch Changes

- Updated dependencies [ca62ade]
  - @contentrain/types@1.6.0

## 0.2.1

### Patch Changes

- 8d5b154: Fix silent body drop: the generated layout filled marks before splitting at `CHROME_BODY_SLOT`, so the `@@body@@` inside the marker comment was consumed by the `@@…@@` pattern (leaving `<!---->`) and page content was never spliced in (measured: 49.8 vs 97.8). Generated projects now compose via `composeBody` — split at the marker first, then fill each side. The contract constant is unchanged; this was an implementation-order bug.

## 0.2.0

### Minor Changes

- 364af0f: Single-injection body chrome. `ChromeChunk` gains a `body` position carrying the new `CHROME_BODY_SLOT` marker (`<!--@@body@@-->`) at any nesting depth — real themes nest the content container (`article > div.entry-content`), so before/after halves are unbalanced fragments the parser silently "repairs" (measured: 36 vs 100). The emitter splices content in at the marker and injects the whole body as ONE fragment; the legacy `before_body`/`after_body` pair still works by composing into a single string. Generated pages pass content via the `body` prop; slot children still work through `Astro.slots.render`.

### Patch Changes

- Updated dependencies [364af0f]
  - @contentrain/types@1.5.0

## 0.1.1

### Patch Changes

- 213c407: Emitted-project correctness against the Astro docs: `<html lang>` now comes from `ProjectIR.site.locales` (was hardcoded `en` — wrong language signal for non-English sites), `astro.config.mjs` sets `site` from `ProjectIR.site.url` (canonical URLs/sitemap), a `tsconfig.json` extending `astro/tsconfigs/base` is emitted, and generated frontmatter types its props (`interface Props` / JSON-derived `type Props`).

## 0.1.0

### Minor Changes

- e8c2a9b: New package: open Astro emitter. Renders a `ProjectIR` + prepared content into a complete Astro project as a pure file map — chrome as `set:html` data, `@@mark@@` slot filling, legacy CSS quarantined in `@layer legacy`, Tailwind 4 evolution layer with extracted `@theme` tokens, item-template list rendering, split-viewport build scaffold, and explicit warnings for anything that fell back.

### Patch Changes

- Updated dependencies [c0960f8]
  - @contentrain/types@1.4.0
