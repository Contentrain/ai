# @contentrain/emitter-astro

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
