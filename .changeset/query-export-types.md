---
"@contentrain/query": patch
---

Fix the `types` path of every package export

`exports` pointed at `dist/index.d.ts`, `dist/cdn/index.d.ts` and
`dist/generator/generate.d.ts` — files tsdown never writes, since it emits
`.d.mts` and `.d.cts`. The package imported and ran fine while every subpath
resolved to no types at all. Each export now names the declaration file for its
condition, and a test asserts every path in the manifest exists in `dist`.
