---
"@contentrain/skills": patch
"@contentrain/rules": patch
"@contentrain/claude-plugin": patch
---

Document the `contentrain_bulk update_status` addressing per model kind (`entry_ids` for collections, `slugs` for documents, neither for singletons/dictionaries), that `publish_at`/`expire_at` on `contentrain_content_save` gate delivery and never change status (`null` clears), and that a legacy non-snake_case field name is kept by `contentrain_model_save` rather than blocking every save of its model.
