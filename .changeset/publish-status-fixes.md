---
"@contentrain/mcp": minor
---

fix(mcp): stop content_save unpublishing entries, and make bulk update_status persist every id

Four publish-status bugs, all found on a live project against the CDN. Each one
reported success while content quietly stopped being delivered.

**`contentrain_content_save` no longer resets an entry's status.** It rebuilt
meta from scratch on every write, so editing one field silently moved a
`published` entry to `draft` — and the next CDN build served the collection as
`{}`. Editing a field is not a publish decision, and per this repo's own split
(MCP is deterministic infra; the agent is intelligence) MCP should never have
been making it. An existing entry now keeps its `status`, `approved_by` and
`version`; only a genuinely new entry starts at `draft`. `source`/`updated_by`
still describe the current write. The same reset lived in a second copy behind
`contentrain_apply` and scaffolding — both now share one `mergeEntryMeta`.

**`contentrain_bulk update_status` no longer drops entries.** It launched one
`writeMeta` per entry ID through `Promise.all`, and every call read the same
snapshot of the shared `{locale}.json` and rewrote the whole file — so N-1
updates were lost while the response reported all N as updated. It is now a
single read-modify-write per locale file, and `updated` counts what actually
persisted. `copy_locale` had the identical race and wrote 1 meta record instead
of N. Neither had any test coverage; `bulk` now has a suite.

**`update_status` works on singletons and dictionaries.** The `entry_ids` guard
ran before the model-kind guard, so a singleton had no reachable path: omitting
`entry_ids` failed with "requires entry_ids", supplying them failed with "only
supported for collection models". Call it without `entry_ids` for these kinds.
It also takes an optional `locale` now, instead of always rewriting every
supported locale.

**Non-i18n models keep exactly one meta record.** Content collapses to a single
`data.json` while meta was still derived from the caller's locale, so one
content file could end up with `meta/{id}/tr.json` *and* `meta/{id}/en.json`
and readers disagreed about which was authoritative. `metaFilePath` now takes
`i18n` and the default locale and pins the record there. This also fixes
non-i18n collection deletes, which looked for `meta/{id}/data.json` — a file
that never existed — and orphaned the meta entry.

**`contentrain_doctor`'s SDK freshness check works again.** It compared
directory mtimes, but `generate` rewrites the client files in place (which never
moves the directory's mtime) while a selective sync recreates model files via
`git checkout` (which does). Once you had saved a model, it reported "Stale"
permanently. It now compares the newest file mtime under each directory.

**`contentrain_validate` gained two checks** for the class of failure above,
since it reported 0 errors throughout: a notice for drafts sitting alongside
published entries in one collection, and a warning for a non-i18n model whose
meta layout disagrees with its content layout. Neither is auto-fixed —
publishing is a content decision.

MIGRATION — read before upgrading Studio. Projects that ran an affected version
have singletons and entries sitting at `draft` that were never meant to be. That
is currently harmless, because the CDN publishes singletons and dictionaries
regardless of status. When Studio starts enforcing status for those kinds, that
content will disappear from the CDN. Upgrade here first, run
`contentrain_validate` to find the drift, restore it with `contentrain_bulk
update_status`, and only then take the Studio change.
