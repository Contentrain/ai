---
"@contentrain/query": minor
---

feat(sdk): CDN bundle preload mode — collapse per-render fetch waterfalls into a single conditional GET

**@contentrain/query**: `createContentrain({ bundle: true })` makes `HttpTransport` fetch `_bundle/{locale}.json` (one artifact with every JSON model for the locale) and serve all collection/singleton/dictionary/document-index reads from memory. Default off — behavior without `bundle` is unchanged.

- **Opt-in `bundle` config.** `true` → `{ revalidateMs: 60_000 }`; the bundle is revalidated with a conditional request (unchanged → `304`) after `revalidateMs`.
- **Transparent fallback.** Bundle `404`/invalid/network error → per-path fetching (retried after `revalidateMs`), so the SDK can ship before the CDN publishes bundles.
- **Scoped coverage.** Only `content/`, `documents/`, `meta/` paths consult the bundle; document bodies, `withMeta()`, manifests, and `models/*` keep per-path fetch. Stale primed paths are evicted when a fresh bundle drops them. Non-i18n `content/{model}/data.json` entries resolve via `defaultLocale`.
- **`client.preload(locale?)`** for eager warmup (e.g. SSR boot); resolves `true` when a bundle was found. Concurrent first reads dedupe into a single bundle request.
