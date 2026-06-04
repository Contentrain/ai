---
"@contentrain/query": major
---

Fix generated client correctness and align with the platform.

**Breaking:** the generated document body field is now `body` (was `content`), matching `@contentrain/types` `DocumentEntry.body` and the MCP `document_save` schema. Update consumers reading `.content` on document entries to `.body`, and regenerate the client.

Also fixed in the generated runtime + types:

- **Dictionary interpolation was broken** in generated output — the param regex lost its escaping during emit, so `dictionary('ui').get('key', { name })` returned the raw `{name}` template. Now interpolates correctly.
- **`DocumentQuery.sort()` added** — documents can now be ordered (e.g. by `published_at`); previously only collections could sort, and calling `.sort()` on a document query threw.
- **`include()` now resolves relations across i18n boundaries** — an i18n:false relation target (e.g. `author`) is resolved whether or not `.locale()` was set, and i18n:true targets resolve when no explicit locale is passed. Previously one side silently stayed an unresolved id string.
- **Generated types corrected** — no more duplicate `slug` member when a document model declares a `slug` field; relation fields are typed as `id | ResolvedTarget` (and `include(...)` arguments are constrained to model keys) so resolved relations are no longer plain `string`.
- **String frontmatter is no longer numerically coerced** — a string-typed field like `"007"` keeps its value instead of becoming `7`.
- **`where(field, 'ne', x)` on array fields** is now the complement of `eq` (membership), matching `eq` semantics.
- Removed dead/misleading CJS proxy code; documented the required `await init()` for CommonJS.
