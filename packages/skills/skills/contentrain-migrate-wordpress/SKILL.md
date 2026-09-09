---
name: contentrain-migrate-wordpress
description: "Import a WordPress site into a .contentrain content store and wire it to a framework. Use when migrating from WordPress, running contentrain import, handling a WXR export or REST URL, or connecting imported content to Astro, Nuxt or Next."
metadata:
  author: Contentrain
  version: "1.0.0"
---

# Skill: Migrate a WordPress Site

> WordPress content → canonical `.contentrain` store → validated → typed client or Astro collections.

---

## When to Use

The user wants to move a WordPress site's **content** into Contentrain: "import my WordPress site", "migrate from WP", "I have a WXR export", "pull posts from wordpress.com", "turn this WP blog into Astro".

**This skill moves content, not design.** Themes, page-builder layouts and rendered HTML are a different problem (a full site clone is the Contentrain migration service). What this skill produces is a clean content store the user's own frontend reads.

---

## Steps

### 1. Pick the source

Two sources, and the choice is usually made for you:

| Source | Use when | Command |
|---|---|---|
| **REST URL** | The site is online and `/wp-json/wp/v2/` answers | `npx contentrain import https://example.com` |
| **WXR export** | The site is offline, behind auth, or the user has a `.xml` from Tools → Export | `npx contentrain import ./export.xml` |

REST returns more than WXR (rendered HTML, media metadata, per-type discovery); WXR is complete but rawer. If both exist, prefer REST.

**Private or partial REST.** A site can answer `/wp-json` but hide drafts, private types and some fields. An Application Password lifts the run to `rest_auth`:

```bash
npx contentrain import https://example.com --auth "user:xxxx xxxx xxxx xxxx"
```

Check first, so you tell the user what they will get rather than discovering it after:

```bash
curl -s "https://example.com/wp-json/wp/v2/types" | head -c 400
```

A `401`/`403` means auth is needed. A `404` or an HTML page means REST is disabled or blocked — use WXR.

### 2. Import

```bash
npx contentrain import <source> --out ./my-site
```

`--force` is required to overwrite an existing `.contentrain/`. **Never pass it without asking** — it replaces models and content the user may have edited.

What lands on disk:

- `.contentrain/models/*.json` + `.contentrain/content/**` — the canonical store
- `import-report.json` — what was inferred, rewritten or dropped
- `entry-source-map.json` — `wp_post_id → { model_id, entry_id }`, the only record connecting the new store to the old site
- `comments-export.json` — written when the source has comments (`contentrain-comments@1`)

Models the importer creates: `posts`, `pages` (and one collection per custom post type), `authors`, `media`, `menus`, `menu-items`, `comments`, a `site` singleton, and one collection per taxonomy.

### 3. Read the report before declaring success

Open `import-report.json` and tell the user what it says. These fields decide whether the import is usable:

| Field | Means | What to do |
|---|---|---|
| `skipped_types` | Post types not imported | Ask if any are needed; a second run with `--auth` may reach them |
| `dropped_relations` | Relations pointing outside the import | Usually a partial import — check the skipped types first |
| `slug_rewritten` / `slug_fallback` | Slugs changed to be valid | Affects URLs → the user needs redirects |
| `title_fallback` | Entries that had no title | They exist but are unlabelled; worth a pass |
| `acf_fields` / `meta_fields` | Custom fields found and their inferred types | Verify the types match intent before content is edited |

**Known gap:** post bodies carry Gutenberg block comments and shortcodes verbatim. They render as-is in HTML but they are WordPress syntax, not portable content. Say so — do not present the import as clean markup when it is not.

### 4. Validate

```bash
npx contentrain validate
```

Fix what it reports before anything reads the store. Structural problems are cheapest here, and the SDK generator will refuse a broken store anyway. See `contentrain-validate-fix` for the fix loop.

### 5. Wire the content to the framework

**Astro** — the content layer, no client generation:

```ts
// src/content.config.ts
import { defineCollection, z } from 'astro:content'
import { contentrainLoader } from '@contentrain/query/astro'

export const collections = {
  posts: defineCollection({
    loader: contentrainLoader({ model: 'posts' }),
    schema: z.object({ title: z.string(), slug: z.string() }).passthrough(),
  }),
}
```

Then `getCollection('posts')` in pages. Documents also get `<Content />`.

**Everything else** (Nuxt, Next, SvelteKit, plain Node) — the generated client:

```bash
npx contentrain generate
```

```ts
import { query } from '#contentrain'
const posts = query('posts').where('status', '=', 'published').all()
```

See `contentrain-generate` for the generator and `contentrain-sdk` for the query API.

### 6. Hand back what is still open

Close the loop honestly. Three things survive the import and need a decision:

1. **Comments.** `comments-export.json` is a payload, not a running service. Either a comments service imports it, or comments stay on WordPress, or they are dropped. The user chooses.
2. **URLs.** Any rewritten slug is a broken inbound link. `entry-source-map.json` plus the report's slug counts are what a redirect list is built from.
3. **Media.** The importer records media metadata; the files themselves still live on the old host until they are moved.

---

## Guardrails

- **Read the report, always.** An import that "worked" while dropping half the post types is worse than one that failed — it looks finished.
- **`--force` is destructive.** Ask first, every time.
- **Never invent content.** If a field is empty after import, it was empty (or unreachable) in the source. Say that instead of filling it.
- **Do not edit `entry-source-map.json`.** It is the only link back to the WordPress ids; comments intake and redirects both read it.
- **Re-importing is not syncing.** A second import overwrites; it does not merge changes made in Contentrain since the first one.

---

## Related

- `contentrain-validate-fix` — the validation loop
- `contentrain-generate` — typed client generation
- `contentrain-sdk` — querying the generated client
- `contentrain-model` — reshaping the imported models
- `references/wordpress-mapping.md` — how WordPress concepts land in Contentrain
