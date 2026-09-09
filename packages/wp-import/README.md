# @contentrain/wp-import

WordPress importers for the Contentrain migration pipeline — ported from a corpus-measured import chain, not written fresh: the identity formulas, PHP-serialized meta decoding, and reference-resolution passes carried over intact.

```
WXR file or REST API ──► RawIR (source-faithful, provenance-stamped)
RawIR ──► .contentrain content store (pure file map) + EntrySourceMap
RawIR + EntrySourceMap ──► CommentsExport (live-service intake payload)
```

## Usage

```ts
import { parseWxr, fetchRestRawIR, rawToContentrain, buildCommentsExport } from '@contentrain/wp-import'

// Highest offline rung: a WXR export file
const { raw, stats } = await parseWxr(createReadStream('export.xml'))

// Or the REST rungs (public, or Application Password → rest_auth)
const { raw: viaRest } = await fetchRestRawIR({ origin: 'https://site.example', auth: { user, appPassword } })

// RawIR → .contentrain (pure: returns { files, entry_source_map, report })
const { files, entry_source_map } = rawToContentrain(raw)

// Comments intake payload for a live comments service
const commentsExport = buildCommentsExport(raw, entry_source_map)
```

## Guarantees

- **Provenance on every document** — which access rung produced it (`rest_public` / `rest_auth` / `wxr` / `bridge`); absence at a low rung is information, not an error.
- **Unresolved references are marked, never dropped** (`resolved` flags, ghost terms joining the pool, dropped-relation counts in the report).
- **Shared identity formulas** — `hexId('posts:' + slug)` — so WXR and REST imports of the same site agree on every entry id (delta imports depend on this).
- **UTC dates** — GMT columns preferred, stamped ISO 8601 `Z`.
- **Pure conversion** — `rawToContentrain` returns a canonical-serialized file map (sorted keys, 2-space indent, trailing newline); writing to disk is the caller's one line.
- **EntrySourceMap produced at the only place that can know it** — the WP-id → entry-address mapping the comments intake requires.

Streaming WXR parse (sax): a 100 MB export holds only its records in memory.

## Multilingual sites

A post's language is read from the plugin — Polylang's `lang` (REST) or its
`language` taxonomy term (WXR), WPML's `wpml_current_locale` — and lands on
`RawPost.lang` verbatim. Translation groups become `RawIR.language_pairs`
(Polylang `translations` / `post_translations`, WPML `wpml_translations`), one
pair per group.

`rawToContentrain` turns more than one locale into an i18n store: post-type
models get `i18n: true`, content and meta are written per locale
(`content/{domain}/{model}/{locale}.json`), and every translation in a group
shares one entry id — the canonical member is the default-locale post (else
the lowest id), so `entry_source_map[wp_id]` addresses each post by that id
and its own locale. Locales are primary subtags (`tr_TR` → `tr`). Taxonomies
stay per-store; the `language` / `post_translations` bookkeeping taxonomies
never become models. `report.locales` and `report.translation_groups` say
what happened. A monolingual site is unchanged (`i18n: false`, `data.json`).

## REST limits and completeness

`fetchRestRawIR` accepts `concurrency` (default 4), `maxPages` (optional cap per
collection), and `perPage` (1–100, default 100). Limits must be positive safe
integers. The concurrency slot includes response body consumption. Truncated
collections and failed pages are named in `warnings`; callers must inspect
these before claiming a complete migration. ACF field/group records and their
cross-model parents remain in the content store; route discovery decides which
records become public pages. Importing configuration does not execute a plugin.
