---
title: WordPress Import
description: "@contentrain/wp-import — WXR and REST importers that turn a WordPress site into source-faithful RawIR, then into a .contentrain content store"
order: 7
slug: wp-import
---

# WordPress Import

[![npm version](https://img.shields.io/npm/v/@contentrain/wp-import)](https://www.npmjs.com/package/@contentrain/wp-import)

`@contentrain/wp-import` reads a WordPress site and produces two things: **`RawIR`** — what the source actually said, before anyone interpreted it — and, from that, a `.contentrain/` content store.

It was ported from a corpus-measured import chain rather than written fresh. The identity formulas, the PHP-serialized meta decoding, and the reference-resolution passes carried over intact, which is why a WXR import and a REST import of the same site agree on every entry id.

```
WXR file or REST API  ──►  RawIR (source-faithful, provenance-stamped)
RawIR                 ──►  .contentrain content store + EntrySourceMap
RawIR + EntrySourceMap ─►  CommentsExport (live-service intake payload)
```

## Install

```bash
pnpm add @contentrain/wp-import
```

## The access ladder

You cannot always reach all of a WordPress site, and pretending otherwise is how migrations lose content silently. Every `RawIR` records **which rung produced it**, because two documents for the same site are only comparable when their rungs are.

| Rung | How it reads the site | Measured field coverage |
|---|---|---|
| `rest_public` | The public REST API, no credentials | ~34% |
| `rest_auth` | REST with an Application Password | ~57% |
| `wxr` | A WXR export file | ~82% |
| `bridge` | The WordPress Bridge plugin | 100% |

::: info The Bridge rung is not in this package
`bridge` is a provenance value this package understands, not an importer it ships. The Bridge plugin is GPL-licensed and lives in a separate repository — a WordPress plugin cannot be MIT and link WordPress core. This package covers the three rungs you can reach from outside the site.
:::

**Absence at a low rung is information, not an error.** A field missing from a `rest_public` import means the public API does not expose it, and the report says so rather than inventing a value.

## Usage

```ts
import { parseWxr, fetchRestRawIR, rawToContentrain, buildCommentsExport } from '@contentrain/wp-import'

// Highest offline rung: a WXR export file
const { raw, stats } = await parseWxr(createReadStream('export.xml'))

// Or the REST rungs — public, or an Application Password for rest_auth
const { raw: viaRest } = await fetchRestRawIR({
  origin: 'https://site.example',
  auth: { user, appPassword },
})

// RawIR → .contentrain — pure: returns { files, entry_source_map, report }
const { files, entry_source_map, report } = rawToContentrain(raw)

// Comments intake payload for a live comments service
const commentsExport = buildCommentsExport(raw, entry_source_map)
```

`rawToContentrain` is a **pure function returning a file map** — canonical-serialized (sorted keys, 2-space indent, trailing newline), exactly as the rest of Contentrain writes JSON. Putting those bytes on disk is the caller's one line. Nothing in this package touches your filesystem or your git repo.

WXR parsing is streaming (sax): a 100 MB export holds only its records in memory, not the document.

## What it guarantees

| Guarantee | Why it matters |
|---|---|
| Provenance on every document | `rest_public` / `rest_auth` / `wxr` / `bridge` — you can always tell how complete an import could have been |
| Unresolved references are marked, never dropped | `resolved` flags, ghost terms joining the pool, dropped-relation counts in the report. Deciding what a broken reference *means* is not an importer's call |
| Shared identity formulas | `hexId('posts:' + slug)` — a WXR import and a REST import of the same site produce the same entry ids, which is what makes delta imports possible |
| UTC dates | GMT columns preferred, stamped ISO 8601 `Z` |
| `EntrySourceMap` produced where it can be known | The WP-id → entry-address mapping that comments intake requires exists only at conversion time |

## Multilingual sites

A post's language is read from the plugin that set it — Polylang's `lang` (REST) or its `language` taxonomy term (WXR), WPML's `wpml_current_locale` — and lands on `RawPost.lang` verbatim. Translation groups become `RawIR.language_pairs`, one pair per group, from Polylang's `translations` / `post_translations` or WPML's `wpml_translations`.

More than one locale turns the output into an i18n store:

- post-type models get `i18n: true`
- content and meta are written per locale — `content/{domain}/{model}/{locale}.json`
- **every translation in a group shares one entry id.** The canonical member is the default-locale post, else the lowest id, so `entry_source_map[wp_id]` addresses each post by that shared id plus its own locale
- locales are primary subtags (`tr_TR` → `tr`)
- the `language` / `post_translations` bookkeeping taxonomies never become models

`report.locales` and `report.translation_groups` say what happened. A monolingual site is unchanged: `i18n: false`, `data.json`.

::: warning Regional locales that collapse
Primary-subtag normalization means `en_US` and `en_GB` both become `en`. A translation group whose regional translations collapse onto the same locale is **rejected** rather than silently overwritten — one of the two would otherwise disappear with no trace.
:::

## REST limits and completeness

`fetchRestRawIR` takes `concurrency` (default 4), `perPage` (1–100, default 100), and an optional `maxPages` cap per collection. Limits must be positive safe integers. The concurrency slot covers response body consumption, not just the request.

**Truncated collections and failed pages are named in `warnings`.** Inspect them before claiming a complete migration — a capped or partially failed REST import looks exactly like a small site otherwise.

ACF field and group records and their cross-model parents stay in the content store; deciding which records become public pages is route discovery's job, further down the pipeline. Importing configuration does not execute a plugin.

## Scheduled posts

A WordPress `future` post becomes `status: published` metadata carrying `publish_at`, which preserves the scheduled-publication intent instead of flattening it to a draft. A scheduled post without a valid date fails the import rather than being guessed at.

::: danger Publication windows are the consumer's job
`status` alone does not tell a public build whether a post should be visible — a `published` entry with a future `publish_at` must not ship. Use the query generator's public-build mode before deployment. Posts imported before this behaviour existed need re-importing or an explicit metadata update.
:::

## Where this sits in the pipeline

This package covers the first leg only. The full chain — and the part of it that is **not** open source — is laid out in the [WordPress Migration guide](/guides/migration).

```
wp-import ──► RawIR ──► [migration engine: ProjectIR] ──► emitter-astro ──► verify
   MIT                       closed source                    MIT            MIT
```

## Related Pages

- [WordPress Migration](/guides/migration) — the end-to-end chain, and which parts are open
- [Astro Emitter](/packages/emitter-astro) — renders the other end of the pipeline
- [Verify](/packages/verify) — the gates that say whether the migrated site is correct
- [Types](/packages/types) — `RawIR`, `EntrySourceMap`, `CapabilityManifest` and the rest of the migration contracts
