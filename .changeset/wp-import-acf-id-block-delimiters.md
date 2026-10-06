---
'@contentrain/wp-import': patch
---

ACF `image`/`file` fields that return the attachment id now resolve the id through the exported attachments to its address instead of keeping it as text ("35"); an id the export does not hold is left out and counted in the new `report.acf_media_unknown`. Post bodies no longer carry Gutenberg block delimiters (`<!-- wp:… -->`, `<!-- /wp:… -->`): only the delimiters are stripped, the markup inside every block stays. Self-closing, server-rendered blocks (`wp:latest-posts`, `wp:block`, …) leave nothing behind and are counted by name in the new `report.blocks_dynamic_dropped`. Re-importing over an existing delivery: a post that was already stored with delimiters and is in the delta as updated lists `body` in `fields_changed` once; it is not a repository edit (conflicts come from the entry's `updated_by`, not the changed fields).
