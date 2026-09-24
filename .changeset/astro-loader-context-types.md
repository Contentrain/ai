---
'@contentrain/query': patch
---

`contentrainLoader` type-checks in Astro 6 and 7 projects with `strict` — `create-astro`'s default — or `exactOptionalPropertyTypes`. `ContentrainLoaderContext` typed `generateDigest` as taking `unknown`, narrower than Astro's `Record<string, unknown> | string`, so `defineCollection({ loader: contentrainLoader(…) })` failed `astro check` with TS2322. Its members now take Astro's own parameter types and every optional member admits `undefined`. No runtime change.
