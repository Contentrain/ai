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
