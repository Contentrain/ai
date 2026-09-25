# @contentrain/wp-import

WordPress importers for the Contentrain migration pipeline — ported from a corpus-measured import chain, not written fresh: the identity formulas, PHP-serialized meta decoding, and reference-resolution passes carried over intact.

```
WXR file or REST API ──► RawIR (source-faithful, provenance-stamped)
RawIR ──► .contentrain content store (pure file map) + EntrySourceMap
RawIR + EntrySourceMap ──► CommentsExport (live-service intake payload)
SourceDeltaPlan + store (+ incoming export) ──► placed SourceDeltaPlan
```

## Usage

```ts
import { parseWxr, fetchRestRawIR, rawToContentrain, buildCommentsExport } from '@contentrain/wp-import'

// Highest offline rung: a WXR export file
const { raw, stats } = await parseWxr(createReadStream('export.xml'))

// Or the REST rungs (public, or Application Password → rest_auth).
// With a credential, drafts, scheduled, pending and private posts and held
// comments are listed too; anonymous REST sees only what is published.
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
- **Only public discussion leaves the site** — `buildCommentsExport` carries comments on published, unprotected entries that are approved or pending (pending lands in the receiver's moderation queue). Comments on drafts, private, scheduled or password-protected entries, any other status (spam, trash, `post-trashed`, a plugin's) and entries the import does not hold, stay behind; `excluded` counts them.

Streaming WXR parse (sax): a 100 MB export holds only its records in memory.

## Source deltas

A bridge reports what changed at the origin since the last delivery as a `SourceDeltaPlan`: `created`, `updated`, `moved` and `deleted` records by WordPress id. `planSourceDelta` works out what each change means for the store:

```ts
import { planSourceDelta, formatSourceDeltaReport } from '@contentrain/wp-import'

const plan = planSourceDelta({
  delta,                                           // the bridge's SourceDeltaPlan
  store: { files, entry_source_map },              // the repository's .contentrain, as it is now
  incoming: { files: next, entry_source_map: nextMap }, // the new export
})
console.log(formatSourceDeltaReport(plan))
```

- **Placement.** A post-type record is looked up in the `EntrySourceMap`. A term or media record is found by its `wp_id` in its own model (`wp-tax-<taxonomy>` / `categories` / `tags`, `wp-media` / `media`). The map lists post ids only, and post 6 and category 6 are different records. A record that cannot be placed gets `unmapped` with a reason: `not-in-source-map`, `no-model-for-type` or `entry-not-found`.
- **`updated` / `moved`** list `fields_changed`, comparing the stored entry with the incoming one (frontmatter keys and `body` for a document). A `moved` record whose address changed adds a 301 to `redirects`. If the store derives entry ids from slugs, the new id is in `entry_id_after`.
- **`deleted`** is a tombstone. `trashed` (can come back) and `purged` (gone) stay distinct.
- **Conflicts.** If the entry's meta says something other than the importer wrote it last (`source` is not `import`, or `updated_by` is not an importer), the record gets `conflict: true` and `repo_edit: { updated_by, updated_at?, source }`. Nothing is overwritten, and a person decides.

The planner is pure and plan-only. Applying a plan is a governed write, and it goes through review. Pass `taxonomies` for custom taxonomies the store has no model of its own for; otherwise their term ids would be read as post ids.

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

Few sites are translated evenly. A post type whose content exists in some of the
site's languages gets `model.locales` — the locales it actually has posts in,
with the default locale always included, since a post that carries no language
tag belongs to it and its absence would be the importer's uncertainty rather
than a fact about the site. A type translated into every locale gets no
`locales` key at all: absent already means "all", and a redundant list would
have to be maintained as locales are added. `contentrain validate` checks
parity against that subset, so pages that only ever existed in one language
stop failing as missing translations. See
[Locale Coverage](https://ai.contentrain.io/reference/model-kinds#locale-coverage).

## REST limits and completeness

`fetchRestRawIR` accepts `concurrency` (default 4), `maxPages` (optional cap per
collection), and `perPage` (1–100, default 100). Limits must be positive safe
integers. The concurrency slot includes response body consumption. Truncated
collections and failed pages are named in `warnings`; callers must inspect
these before claiming a complete migration. ACF field/group records and their
cross-model parents remain in the content store; route discovery decides which
records become public pages. Importing configuration does not execute a plugin.

### Site name over REST

`fetchRestRawIR` reads the `/wp-json/` index for the site's name and tagline
(`RawIR.site.title` / `description`, the store's `site` singleton) and its
install and public addresses (`base_site_url` / `base_blog_url`). An index that
does not answer leaves them out.

### Menus over REST

With an Application Password, `fetchRestRawIR` reads the site's menus into
`RawIR.menus`: classic menus (`/wp/v2/menus` + `/wp/v2/menu-items`, with the
theme locations each is assigned to) and a block theme's published
`wp_navigation` posts (links, submenus, page lists, home links). A block menu's
`locations` are the template-part areas (`header`, `footer`) whose navigation
block refers to it; an empty navigation block without a `ref` shows the most
recent published one, as WordPress does. Block menu items have no WordPress id
and get negative ids; the store claims no `wp_id` for them.

A menu item that is itself a draft, or whose post target is not proven public
— a draft, pending, private, scheduled or password-protected post, or one this
import never read (a type outside REST, a listing past a page cap) — is left
out, fail-closed: its label is often that post's title. Its children move up to the
nearest kept ancestor; `warnings` gives only the count.

Both need `edit_theme_options`. Without a credential, with a rejected one, or
with a user who lacks that right, no menus are read and the result's `gaps`
contains `menus_require_auth` — an empty menu list is never presented as the
site having none. The `menus` model gains a `locations` field only when the
source named them.

### ACF fields, custom post types and taxonomies over REST

ACF / Secure Custom Fields values arrive on a post's `acf` key — only for field
groups set to "Show in REST API" (off by default). Each field is typed by one
versioned table (`ACF_MAPPING_VERSION`, exported with `ACF_SCALAR_TYPES` and
`ACF_REFERENCE_TYPES`): the ACF type is read from SCF's `<name>_source.type`
where the site states it, and inferred from the value's shape only when nothing
states it (the field description then says so).

| ACF | Contentrain |
| --- | --- |
| text, time picker | `string` |
| textarea | `text` |
| wysiwyg | `richtext` |
| email / url, oembed / number, range / true false | `email` / `url` / `number` / `boolean` |
| date picker / date time picker | `date` / `datetime` (ISO) |
| color picker / icon picker | `color` / `icon` |
| select, radio, button group | `select` (its choices) |
| checkbox, multiple select | `array` of `select` |
| image / file | `image` / `file` (the URL) |
| link | `object { url, title, target }` |
| google map | `object { address, lat, lng, zoom }` |
| group | `object` of its fields |
| repeater | `array` of `object` (nested repeaters nest) |
| flexible content | `array` of `object`: a required `layout` select plus the union of the layouts' fields |
| post object, relationship | `relation` / `relations` to the entries' models |
| taxonomy / user / gallery | `relations` to the term model / `authors` / media |
| page link | `url`: the target's address, only when the target is published and unprotected |
| tab, accordion, message | nothing (layout only) |
| password | nothing, ever |

**A password field is never read.** Its value is skipped where the source
states the type; where it does not, a secret-looking name (`password`, `token`,
`api_key`, …) is skipped instead. It never reaches `RawIR`, the store, or a
report.

ACF values follow their post: a draft's fields land in the store with the
draft (meta `status: draft`), like its body. A reference to an entry the import
did not read is dropped and counted in `dropped_relations`. The report's
`acf_fields` lists each field's type. When any post carries an `acf` key, the
result's `gaps` contains `acf_partial`: groups without REST exposure, options
pages and fields on post types outside REST are not visible to REST — the
Bridge reads those.

With an Application Password, post types are read with `context=edit` so their
`viewable` flag is known: a type that is in REST but not publicly queryable (a
testimonial post type, say) keeps its content but gets no address (`link` is
null), so no route or redirect claims a page that does not exist. Custom
taxonomies in REST are read with their terms, and a post's terms in them become
its relations.


### Publication and translation identity

WordPress `future` posts become `status: published` metadata with `publish_at`,
preserving scheduled publication intent. A scheduled post without a valid date
fails import. Public consumers must filter the publication window, not status
alone; use the query generator/loader's public-build mode before deployment.
Previously imported future posts need re-importing or an explicit metadata update.

Translation groups share one entry identity across locales. Distinct groups
with the same canonical slug receive distinct deterministic identities; existing
non-colliding identities are unchanged. Rebuild the entry map and comments export
from the same corrected import. Locale normalization currently uses primary
language codes: a group whose regional translations collapse to the same locale
is rejected rather than silently overwritten.
