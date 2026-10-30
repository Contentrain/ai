---
'@contentrain/wp-import': minor
---

Taxonomy fields are snake_case: a post links its terms in `portfolio_category`, not `portfolio-category`. The model id keeps its hyphen, and `categories` and `tags` are unchanged. A taxonomy whose field name is already taken on the model (a core field, or a second taxonomy with the same name) gets a counter instead of overwriting it, and the report lists it in `tax_fields_renamed`. The source-delta planner compares a store imported before this under its stored field names, so an existing kebab-case field is never reported as changed. New export: `taxFieldId`.
