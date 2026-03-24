---
"@contentrain/query": minor
---

feat(sdk): add CDN transport for remote content delivery

New `createContentrain()` factory for async HTTP-based content access from Contentrain Studio CDN.

- New `./cdn` subpath export with `HttpTransport`, async query classes
- `ContentrainError` class for HTTP error handling (401, 403, 404, 429)
- ETag-based HTTP caching for efficient CDN fetching
- Extended `where()` operators: eq, ne, gt, gte, lt, lte, in, contains
- Metadata endpoints: `manifest()`, `models()`, `model(id)`
- Zero breaking changes — existing sync local mode is unaffected
