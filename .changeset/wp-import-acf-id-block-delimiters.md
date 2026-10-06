---
'@contentrain/wp-import': patch
---

ACF `image`/`file` fields that return the attachment id now resolve the id through the exported attachments to its address instead of keeping it as text ("35"); an id the export does not hold is left out and counted in the new `report.acf_media_unknown`. Post bodies no longer carry Gutenberg block delimiters (`<!-- wp:… -->`, `<!-- /wp:… -->`): only the delimiters are stripped, the markup inside every block stays.
