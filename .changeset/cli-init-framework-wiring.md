---
"contentrain": patch
---

`contentrain init` now prints stack-aware SDK wiring guidance after setup: for bundler stacks (Nuxt/Next/Vite/etc.) it shows the `#contentrain` subpath import, points to the `contentrain-sdk` bundler-alias skill, and recommends a `prebuild`/`predev` generate step (because `.contentrain/client/` is git-ignored and must be regenerated on fresh clones / CI). Nuxt projects also get a server-only reminder.
