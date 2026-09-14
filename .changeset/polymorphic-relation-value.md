---
"@contentrain/types": patch
"@contentrain/wp-import": patch
"@contentrain/skills": patch
"@contentrain/claude-plugin": patch
---

`validateFieldValue` accepts a polymorphic relation. A `relation` whose `model` lists several targets stores `{ model, ref }` — the schema documents it and the MCP validator enforces it — but the type check knew only the string form and rejected every such value, so an imported media library failed validation on every attachment with a `parent`. The pair is now required exactly when there are several targets (a one-element `model` array is a single target and stores the id), and a `model` outside the declared targets is an error.

`rawToContentrain` writes a relation over one target as the entry id. Media `parent`, comment `post` and menu-item `target` always wrote `{ model, ref }`, which is invalid when a site has a single content type (and, for menu targets, no taxonomies). The choice is now made in one place from the same list the model declares, and a test checks every field the importer writes against its own model.

The skills' schema reference and the field-types reference now show the polymorphic storage form.
