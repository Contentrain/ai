---
"@contentrain/mcp": patch
---

fix(mcp): make i18n:false delete and meta cleanup safe

Two bugs a project hit while cleaning up an `i18n: false` collection, plus a
source-hygiene fix surfaced along the way.

**`content_delete` no longer destroys content when handed a locale.** On an
`i18n: false` model, passing a non-default `locale` was destructive: the locale
mapped onto `data.json` and the default-locale meta, so the call emptied the
shared content and deleted the wrong meta file while the locale actually named
kept its stray meta — the opposite of the request. Content is locale-agnostic
here, so a locale-scoped delete is now rejected with a clear error (both in the
plan API and the legacy path). Omit `locale` to delete the entry.

**`contentrain_validate` with `fix: true` now clears the meta layout mismatch it
warns about.** The "Meta layout mismatch" warning had no remediation, so `fixed`
stayed `0`. The fix is deterministic and never decides a status: when the
default-locale meta is authoritative the redundant strays are pruned; when only
a stray exists it is migrated to the default path so the record is preserved;
several strays with no default is left for the author to resolve. Consolidation
runs before the orphan-content pass and gates that pass's draft fabrication, so
a real published record is never replaced by a fabricated draft and then deleted
on a later run.

Also replaced two raw NUL bytes in the validator source (a Map-key separator)
with a `\u0000` escape — identical at runtime, but the source is now plain text
instead of being classified as binary by grep/diff/editors.
