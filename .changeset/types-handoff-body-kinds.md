---
"@contentrain/types": minor
---

`MigrationHandoff.content_summary.body_kinds` counts standalone pages by body kind, with the vocabulary exported as `PAGE_BODY_KINDS` / `PageBodyKind`: `html` (editor markup — carried as content and still editable), `builder_html` (rendered by a page builder — carried as rendered, no longer edited in that builder) and `none` (the theme renders the page). A single "pages migrated" number hid which of those promises was made. Every kind is present when the field is, so a zero is a count rather than an omission; the field itself is optional.
