# @contentrain/wp-import

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
