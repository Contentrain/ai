# Skill: Run Bulk Content Operations

> Apply safe batch operations to existing content entries.

---

## When to Use

Use this when the user wants to:

- copy one locale to another
- update status on many entries
- delete multiple collection entries

This skill is for existing content, not for schema design.

---

## Steps

### 1. Inspect the Model

Call `contentrain_status` and `contentrain_describe(model: "<model-id>")` first.

Confirm:

- model kind
- whether `i18n` is enabled
- which locales are supported

### 2. Pick the Correct Bulk Operation

- `copy_locale`: clone one locale to another for i18n-enabled `collection`, `singleton`, or `dictionary` models
- `update_status`: update metadata state for many collection entries
- `delete_entries`: remove many collection entries at once

### 3. Apply Safety Rules

- never use `copy_locale` on non-i18n models
- `update_status` and `delete_entries` are collection-only
- confirm entry IDs before delete operations
- batch only related entries together

### 4. Execute with `contentrain_bulk`

Examples:

```json
{
  "operation": "copy_locale",
  "model": "ui-labels",
  "source_locale": "en",
  "target_locale": "tr"
}
```

```json
{
  "operation": "update_status",
  "model": "blog-post",
  "entry_ids": ["post_001", "post_002"],
  "status": "in_review"
}
```

```json
{
  "operation": "delete_entries",
  "model": "faq-items",
  "entry_ids": ["faq_01", "faq_02"],
  "confirm": true
}
```

### 5. Validate When Needed

After `copy_locale` or status-heavy cleanup, call `contentrain_validate` if content correctness may have changed.

### 6. Submit

Bulk operations still create branches/commits. Call `contentrain_submit` if the project is in review flow.

### 7. Final Summary

Report:

- operation performed
- model affected
- locale or entry count affected
- validation outcome if run
- submit status

