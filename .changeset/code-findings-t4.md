---
"contentrain": patch
"@contentrain/mcp": patch
"@contentrain/rules": patch
"@contentrain/skills": patch
---

- `contentrain scaffold --no-sample` now skips sample content. The flag was declared under a name the argument parser never sets, so sample content was always written.
- `contentrain_merge` with `model` + `locale` now resolves the locale-scoped branch (`cr/{scope}/{model}/{locale}/…`, as bulk copy-locale writes). Before, the narrowing looked for a `cr/content/{model}/{locale}/` prefix no branch has.
- `contentrain_submit` and the branch-pressure hints name `cr/*` branches, which is what they act on (they said `contentrain/*`).
- `@contentrain/rules` and `@contentrain/skills`: `exports["."]` pointed `types` at `dist/index.d.ts`, which the build does not emit. Types are now declared per condition (`.d.mts` for import, `.d.cts` for require), with top-level `main` / `module` / `types` for older resolvers.
