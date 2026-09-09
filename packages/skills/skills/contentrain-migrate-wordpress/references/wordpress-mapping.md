# WordPress → Contentrain mapping

What `contentrain import` actually produces, so you can answer "where did my X go?" without opening the importer.

## Models

| WordPress | Contentrain model | Kind | Domain |
|---|---|---|---|
| Posts | `posts` | collection | `blog` |
| Pages | `pages` | collection | `blog` |
| Custom post type `event` | `event` | collection | `blog` |
| Categories | `categories` | collection | `blog` |
| Tags | `tags` | collection | `blog` |
| Custom taxonomy `product_line` | `product-line` | collection | `blog` |
| Users | `authors` | collection | `blog` |
| Media library | `media` | collection | `assets` |
| Menus | `menus` + `menu-items` | collection | `site` |
| Comments | `comments` | collection | `blog` |
| Site title / tagline / URL / language | `site` | **singleton** | `site` |

Every model is `i18n: false`. WordPress multilingual plugins (WPML, Polylang) keep translations as separate posts, so they arrive as separate entries — not as locales. Reshaping them into one i18n model is a modelling decision the agent makes with the user, not something the importer guesses.

## Post fields

Fields are added **only when at least one entry in that post type has the data**, so an import of a site without excerpts has no `excerpt` field at all.

| Field | Type | Present when |
|---|---|---|
| `title` | string (required) | always |
| `slug` | slug (required, unique) | always |
| `excerpt` | text | any entry has an excerpt |
| `body` | richtext | any entry has content |
| `published_at` | datetime | any entry has a date |
| `author` | relation → `authors` | any entry has an author |
| `<taxonomy>` | relations → that taxonomy | the type uses that taxonomy |
| `cover` | relation → `media` | any entry has a featured image |
| `wp_id` | integer (required, unique) | always |
| `modified_at` | datetime | always |
| `link` | url | always — the original permalink |
| `parent` | relation → same model | any entry has a parent |
| `menu_order`, `sticky`, `template` | integer / boolean / string | the source uses them |
| `format` | select | the type uses post formats |
| `visibility` | select `public\|private\|password` | any entry is private or password-protected |
| `comments_open` | boolean | the source carries comment status |

## Status

WordPress status becomes Contentrain meta, not a field:

| WP | Contentrain |
|---|---|
| `publish`, `inherit` | `published` |
| `future` | `draft` + `publish_at` (the scheduled date survives) |
| `pending` | `in_review` |
| `trash` | `archived` |
| everything else (`draft`, `private`, …) | `draft` |

Comments map by approval: `1` → published · `spam`/`trash` → archived · anything else → `in_review`.

## Custom fields

- **Open meta keys** become fields with a type inferred from the value, and are listed in `import-report.json → meta_fields`.
- **ACF fields** become fields tagged `description: "ACF"`, listed under `acf_fields`. Object-shaped values land as `object`.
- **Underscore-prefixed meta** (`_edit_lock`, `_thumbnail_id`, `_elementor_*`, …) is WordPress plumbing and is dropped.
- **Plugin meta** matching `jetpack|wpdc|discourse|footnotes|inline_featured|spay_|advanced_seo|rank_math|yoast` is dropped — it is plugin state, not editorial content.

Inferred types are a guess from one value. Check `meta_fields` and `acf_fields` in the report before anyone edits content: fixing a wrong type later means touching every entry.

## What is not imported

Post types matching `attachment|nav_menu_item|wp_*|jp_*|pattern|revision|oembed_cache|customize_changeset|user_request|custom_css` are skipped and listed in `report.skipped_types`, and so are theme / page-builder internals that store design rather than content: GeneratePress elements (`gp_elements`, `gp-elements`), GenerateBlocks styles (`gblocks_*`, `gblocks-*`), Elementor templates (`elementor_library`, `e-landing-page`) and form definitions (`wpcf7_contact_form`, `wpforms*`). Membership and other content-bearing CPTs stay; ACF field records stay too, since their cross-model parents are part of the lossless import. Attachments are not skipped content — they arrive as the `media` collection.

Also outside the import: themes, widgets, plugin settings, users' passwords and roles, and the media **files** themselves (only their metadata and URLs come across).

## Ids and the link back

Entry ids are deterministic hex derived from the WordPress id (`media:12`, `comments:34`, `menus:<slug>`), so re-running an import produces the same ids. `entry-source-map.json` records `wp_post_id → { model_id, entry_id }` — it is what a comments intake and a redirect list are built from, and nothing else records it.

## Relations that point nowhere

A relation whose target was not part of the import (a comment on a skipped post type, a term never listed) is either dropped and counted in `report.dropped_relations`, or — for terms referenced but not listed — added to the pool from the reference itself. A high `dropped_relations` usually means the import was partial: check `skipped_types` and whether `--auth` would reach more.

## Known gaps

- **Gutenberg and shortcodes** stay verbatim in `body`. `<!-- wp:paragraph -->` and `[gallery]` render as-is in HTML but they are WordPress syntax; converting them is a separate pass.
- **Media files** stay on the old host until moved.
- **Redirects** are not generated. `slug_rewritten` + `slug_fallback` in the report say how many URLs changed.
