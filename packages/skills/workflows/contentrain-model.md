# Skill: Design and Save Models

> Create or evolve Contentrain model definitions safely.

---

## When to Use

Use this when the user wants to:

- add a new model
- change fields on an existing model
- choose between `singleton`, `collection`, `document`, and `dictionary`
- define relations, locales, or custom content paths

---

## Steps

### 1. Inspect Project State

Call `contentrain_status` first:

- confirm the project is initialized
- see existing model IDs and domains
- avoid creating duplicates

If the user is extending an existing model, call `contentrain_describe(model: "<model-id>")`.

### 2. Confirm Storage Contract

Call `contentrain_describe_format` before proposing structure changes.

Use it to confirm:

- model kinds and storage expectations
- locale behavior
- document vs JSON model tradeoffs
- how custom `content_path` and `locale_strategy` affect files

### 3. Choose the Right Kind

- `singleton`: one object per locale, e.g. hero, navigation, footer
- `collection`: repeated entries with IDs, e.g. testimonials, faq items, authors
- `document`: long-form markdown content with frontmatter, e.g. blog posts, docs pages
- `dictionary`: flat key-value strings, e.g. UI labels, error messages

Default rules:

- use `dictionary` for UI/system strings
- use `document` for markdown-heavy long-form content
- use `collection` for repeated structured items
- use `singleton` for one page/section config per locale

### 4. Design Fields

Follow these rules:

- model IDs must be kebab-case
- field names must be snake_case
- relation fields must define a target `model`
- prefer small, explicit schemas over large generic `object` blobs
- only mark fields as `required` when the content truly cannot function without them

Relation guidance:

- `relation`: single reference
- `relations`: multiple references
- use `slug`-driven relations for document-like linking

### 5. Decide i18n and Path Strategy

Ask or infer:

- should this model be localized?
- should it use the default `.contentrain/content/...` path or a custom `content_path`?
- if custom path is needed, which `locale_strategy` matches the project layout?

Use custom paths only when the framework or repo structure clearly benefits from it.

### 6. Present the Proposed Model

Before writing, show:

- model ID
- kind
- domain
- `i18n` behavior
- field list with types
- relation targets
- any custom `content_path` / `locale_strategy`

Get user confirmation before saving.

### 7. Save the Model

Call `contentrain_model_save` with the approved definition.

Example:

```json
{
  "id": "hero",
  "name": "Hero",
  "kind": "singleton",
  "domain": "marketing",
  "i18n": true,
  "fields": {
    "title": { "type": "string", "required": true },
    "subtitle": { "type": "text" },
    "cta_label": { "type": "string" },
    "featured_post": { "type": "relation", "model": "blog-post" }
  }
}
```

### 8. Validate Downstream Impact

After changing a model:

- review whether existing content now needs updates
- call `contentrain_validate`
- if the model is consumed by the SDK, recommend `contentrain generate`

### 9. Final Summary

Report:

- model created or updated
- kind and domain
- field count
- any relation targets
- whether content migration is needed next

