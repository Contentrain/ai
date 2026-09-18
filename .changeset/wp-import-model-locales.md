---
"@contentrain/wp-import": minor
---

`rawToContentrain` writes `model.locales` for a partially-translated site: each post type declares the locales it actually has content in, so `contentrain validate` checks parity against that subset instead of the whole project list. Pages that only ever existed in one language stop being hard errors.

The project's default locale is always included — a post carrying no language tag belongs to it, so its absence would be the importer's uncertainty rather than a fact about the site. A post type translated into every locale gets no `locales` key at all: absent already means "all", and a redundant list would have to be maintained as locales are added. A monolingual site is unchanged.

No new report is produced here; this only sets `model.locales` correctly.
