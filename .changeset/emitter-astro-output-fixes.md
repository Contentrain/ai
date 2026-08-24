---
"@contentrain/emitter-astro": patch
---

Emitted-project correctness against the Astro docs: `<html lang>` now comes from `ProjectIR.site.locales` (was hardcoded `en` — wrong language signal for non-English sites), `astro.config.mjs` sets `site` from `ProjectIR.site.url` (canonical URLs/sitemap), a `tsconfig.json` extending `astro/tsconfigs/base` is emitted, and generated frontmatter types its props (`interface Props` / JSON-derived `type Props`).
