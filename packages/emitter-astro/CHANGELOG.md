# @contentrain/emitter-astro

## 0.1.1

### Patch Changes

- 213c407: Emitted-project correctness against the Astro docs: `<html lang>` now comes from `ProjectIR.site.locales` (was hardcoded `en` — wrong language signal for non-English sites), `astro.config.mjs` sets `site` from `ProjectIR.site.url` (canonical URLs/sitemap), a `tsconfig.json` extending `astro/tsconfigs/base` is emitted, and generated frontmatter types its props (`interface Props` / JSON-derived `type Props`).

## 0.1.0

### Minor Changes

- e8c2a9b: New package: open Astro emitter. Renders a `ProjectIR` + prepared content into a complete Astro project as a pure file map — chrome as `set:html` data, `@@mark@@` slot filling, legacy CSS quarantined in `@layer legacy`, Tailwind 4 evolution layer with extracted `@theme` tokens, item-template list rendering, split-viewport build scaffold, and explicit warnings for anything that fell back.

### Patch Changes

- Updated dependencies [c0960f8]
  - @contentrain/types@1.4.0
