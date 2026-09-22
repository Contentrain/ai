---
"@contentrain/types": minor
"@contentrain/query": minor
"contentrain": patch
---

A `mediaBaseUrl` resolver for relative `media/...` content references.

`resolveMediaUrl(value, mediaBaseUrl)` and `resolveMediaRefsInBody(markdown, mediaBaseUrl)` are new package-root exports: pure, framework-agnostic functions that turn a stored `media/...` path — or every `](media/...)` link and image embed inside a markdown string — into an absolute delivery URL. Already-absolute values pass through untouched, and no base is a no-op, so this stays entirely opt-in.

The generated client's `media(value)` resolver gains a markdown counterpart, `mediaBody(markdown)`, and both now take an optional second argument that overrides the base baked in at generate time for that one call — the hook a Nuxt app (or any host with its own runtime config) uses to stay on one build across environments instead of rebaking per deployment. `generate()`'s `cdnBaseUrl` option is renamed `mediaBaseUrl` (the CLI's `--cdnBaseUrl` flag, and the old option name, still work as deprecated aliases).

`contentrainLoader()` (`@contentrain/query/astro`) takes the same `mediaBaseUrl` and applies it automatically to `image`/`video`/`file` fields — including those nested inside `object`/`array` fields, such as an image gallery — to `markdown`/`richtext` fields, and to a document's body, resolving titled markdown embeds and inline HTML `src`/`href` attributes as well as plain link/image targets. This loader reads `.contentrain` directly, so nothing upstream has rewritten those references yet.

`@contentrain/types` gains the rewrite engine itself as public exports — `isStoredMediaPath`, `toDeliveryUrl`, `rewriteMediaUrl`, `rewriteFieldMedia`, `rewriteEntryMedia`, `rewriteMarkdownMedia` — moved here from `@contentrain/mcp`'s internal write-time normalizer so both packages share one definition of "what counts as a media reference" instead of drifting apart: `@contentrain/mcp` already used these rules to normalize media on write (hosted/cloud mode), and `@contentrain/query` now uses the identical rules to resolve them on read (local mode).

Studio's own delivery URLs are unaffected — this only resolves the relative form for consumers that read content directly (a generated client, the Astro loader, or a raw markdown/richtext body) rather than through Studio's CDN, which already resolves absolute URLs on write.
