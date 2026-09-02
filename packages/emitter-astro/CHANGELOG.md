# @contentrain/emitter-astro

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
