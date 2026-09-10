# @contentrain/wp-import

## 0.4.1

### Patch Changes

- 4ddf24c: Preserve distinct translation groups when their canonical posts share a slug. Existing non-colliding entry identities remain unchanged; colliding groups receive deterministic WP-id identities. Reject translation groups that collapse to one normalized locale instead of silently overwriting a translation.

  Render parameterless collection routes directly from exactly one content entry, with an explicit build error for missing or ambiguous data. Exclude public assets and dependencies from generated Astro typechecking to prevent legacy WordPress JavaScript from exhausting the build heap.

  WordPress `future` posts preserve publication intent as published metadata gated by `publish_at`. Undated scheduled posts fail import. Public consumers must honor the publication window rather than checking status alone.

  The migrate skill's mapping reference carried the old `future` → `draft` answer; a parity test now runs the importer and holds the status table to what it actually writes.

## 0.4.0

### Minor Changes

- c1f1984: Multilingual sites import as an i18n store

  `RawPost.lang` carries a post's language as the plugin reports it (Polylang
  `lang` / `language` term, WPML `wpml_current_locale`), and the REST and WXR
  importers fill `RawIR.language_pairs` from Polylang `translations` /
  `post_translations` and WPML `wpml_translations` — one pair per group.

  `rawToContentrain` sees more than one locale and switches post-type models to
  `i18n: true`: content and meta per locale, one shared entry id per translation
  group (canonical = default-locale post, else lowest id), `entry_source_map`
  locale per post, `config.locales.supported` listing every locale. Language
  bookkeeping taxonomies never become models. Monolingual sites are unchanged.
  Until now the REST path dropped `lang` and Migrate had to patch locales into
  the source map by hand.

### Patch Changes

- Updated dependencies [c1f1984]
  - @contentrain/types@1.13.0

## 0.3.0

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

## 0.2.2

### Patch Changes

- Updated dependencies [adf26c1]
  - @contentrain/types@1.11.0

## 0.2.1

### Patch Changes

- 94a9e11: Preserve WordPress parent links across exported post types, including ACF field
  groups and nested fields. Single-target parents remain entry ID strings; mixed
  targets use the existing polymorphic relation contract. Excluded WordPress types
  no longer produce dangling entry-source addresses or relation targets. Missing
  parents remain reported as dropped relations.

## 0.2.0

### Minor Changes

- bc10dc0: `contentrain-migrate-wordpress` skill

  The WordPress path existed as packages (`@contentrain/wp-import`, `contentrain import`) but no skill taught an agent to walk it: pick the source, import, **read the report**, validate, then wire the content to Astro's content layer or the generated client — and hand back what the import cannot decide (comments, redirects, media files).

  `references/wordpress-mapping.md` documents where each WordPress concept lands, which fields appear only when the source has the data, how status maps, and what is dropped.

  `@contentrain/wp-import` now exports `SKIP_TYPES` and `PLUGIN_META`. They are documented behaviour — an agent has to answer "why is my custom post type missing?" — and a parity test holds the reference to them, so an exclusion added to the importer cannot silently outlive its documentation.

## 0.1.7

### Patch Changes

- Updated dependencies [b4724a1]
  - @contentrain/types@1.10.0

## 0.1.6

### Patch Changes

- Updated dependencies [487a061]
  - @contentrain/types@1.9.1

## 0.1.5

### Patch Changes

- Updated dependencies [68f4582]
  - @contentrain/types@1.9.0

## 0.1.4

### Patch Changes

- Updated dependencies [4079160]
  - @contentrain/types@1.8.0

## 0.1.3

### Patch Changes

- Updated dependencies [b92140a]
  - @contentrain/types@1.7.0

## 0.1.2

### Patch Changes

- Updated dependencies [ca62ade]
  - @contentrain/types@1.6.0

## 0.1.1

### Patch Changes

- Updated dependencies [364af0f]
  - @contentrain/types@1.5.0

## 0.1.0

### Minor Changes

- 87a11a8: New package: WordPress importers. `parseWxr` (streaming WXR → RawIR with PHP-serialized meta decoding, ACF pairing, menu/comment threading, resolution flags), `fetchRestRawIR` (public/Application-Password REST → RawIR with paginated fetch and injectable fetch), `rawToContentrain` (RawIR → canonical `.contentrain` file map + `EntrySourceMap` + import report), and `buildCommentsExport`/`summarizeComments` (`contentrain-comments@1` intake payload).

### Patch Changes

- Updated dependencies [c0960f8]
  - @contentrain/types@1.4.0
