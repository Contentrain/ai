---
"@contentrain/wp-import": patch
---

Preserve WordPress parent links across exported post types, including ACF field
groups and nested fields. Single-target parents remain entry ID strings; mixed
targets use the existing polymorphic relation contract. Excluded WordPress types
no longer produce dangling entry-source addresses or relation targets. Missing
parents remain reported as dropped relations.
