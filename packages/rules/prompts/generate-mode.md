# Generate Mode — Create New Contentrain Project Content

> **Prerequisites:** Read `prompts/common.md` first. All shared rules apply.

This mode is for creating a new Contentrain project from scratch: initializing the directory structure, defining models, and populating content.

---

## Pipeline

Follow these steps in order. Do not skip steps.

```
Step 1: contentrain_init
Step 2: Plan models (agent intelligence — no tool call)
Step 3: contentrain_model_save (repeat per model)
Step 4: contentrain_content_save (repeat per entry, per locale)
Step 5: contentrain_validate
Step 6: contentrain_submit
```

---

## Step 1: Initialize

Call `contentrain_init` with detected or user-specified configuration:

```
contentrain_init(stack: "{stack}", locales: ["{default_locale}", ...], domains: [...])
```

If the project is already initialized, skip this step. Call `contentrain_status` to check.

Optional: Use `contentrain_scaffold` to bootstrap from a template (blog, landing, docs, ecommerce, saas, i18n, mobile). This creates models and sample content in one call.

---

## Step 2: Plan Models

Before creating any models, analyze the project needs. This is YOUR job as the intelligence layer.

### Questions to Answer

1. **What content does this project need?** Identify all user-visible text, structured data, and repeating items.
2. **How should content be grouped?** Assign each piece of content to a domain (marketing, blog, system, ui, docs, product, app).
3. **What model kind fits each group?** Use this decision matrix:

| Pattern | Kind | When to Use |
|---------|------|-------------|
| One set of fields per page section | `singleton` | Hero sections, site config, navigation, page headers |
| Multiple items of the same structure | `collection` | Team members, FAQs, testimonials, products, categories |
| Long-form content with metadata | `document` | Blog posts, documentation pages, changelogs |
| Flat key-value UI strings | `dictionary` | Error messages, button labels, form labels, notifications |

### Planning Constraints

- Prefer fewer models with clear boundaries over many granular models.
- Group related content into the same domain. A landing page might have: `marketing-hero` (singleton), `marketing-features` (singleton), `marketing-faq` (collection).
- Every model needs a unique kebab-case ID and a descriptive human-readable name.
- Decide `i18n: true` or `false` for each model. Default to `true` if the project has multiple locales.
- Plan relations between models before creating them (e.g., blog posts reference authors and categories).

### Field Design Guidelines

Follow `rules/shared/schema-rules.md` for the full type reference. Key guidelines:

- Use the most specific type available. Use `email` not `string` for emails. Use `slug` not `string` for URL identifiers.
- Mark fields as `required: true` only when the content is meaningless without them.
- Set `unique: true` on fields that must not duplicate (titles, slugs, emails).
- Set `min` / `max` constraints for text fields to enforce quality (e.g., title: min 10, max 120).
- Use `description` on every field to provide context for other agents and Studio users.
- Omit default values for properties — do not include `required: false` or `unique: false`.

---

## Step 3: Create Models

Call `contentrain_model_save` for each model in your plan:

```
contentrain_model_save(
  id: "blog-post",
  name: "Blog Post",
  kind: "document",
  domain: "blog",
  i18n: true,
  description: "Blog articles with markdown body",
  fields: {
    "title": { "type": "string", "required": true, "min": 10, "max": 120, "description": "Article title" },
    "slug": { "type": "slug", "required": true, "unique": true, "description": "URL-safe identifier" },
    "excerpt": { "type": "text", "required": true, "min": 50, "max": 200, "description": "Article summary for cards and SEO" },
    "author": { "type": "relation", "model": "team-members", "required": true, "description": "Article author" },
    "tags": { "type": "array", "items": "string", "description": "Topic tags" }
  }
)
```

### Model Creation Order

1. Create independent models first (no relations to other models).
2. Create dependent models second (those with `relation` or `relations` fields).
3. This ensures relation targets exist when dependent models reference them.

### Dictionary Models

Dictionary kind models have NO `fields` property. Content is flat key-value pairs:

```
contentrain_model_save(
  id: "error-messages",
  name: "Error Messages",
  kind: "dictionary",
  domain: "system",
  i18n: true,
  description: "User-facing error messages"
)
```

---

## Step 4: Create Content

Call `contentrain_content_save` for each entry in each locale:

```
contentrain_content_save(
  model: "blog-post",
  locale: "en",
  data: {
    "title": "Deploy Node.js to Production in 5 Minutes",
    "slug": "deploy-nodejs-production",
    "excerpt": "Learn the fastest way to deploy a Node.js application to production with zero-downtime.",
    "author": "a1b2c3d4e5f6",
    "tags": ["nodejs", "deployment", "devops"]
  }
)
```

### Content Creation Constraints

- **Never write system fields** (id, createdAt, updatedAt, status, order). They are managed automatically.
- **Use vocabulary terms** from `vocabulary.json`. Do not invent synonyms for canonical terms.
- **Follow content type patterns** from `rules/shared/content-quality.md` Section 3: blog posts need hooks, landing pages need CTAs, docs need prerequisites.
- **Create all locales** for every entry. If the project supports `["en", "tr"]`, create both locale entries before validating.
- **Batch related changes.** Create all entries for a model before moving to the next model. Do not call `contentrain_submit` after every single entry.
- **No placeholder text.** Every field must contain real, meaningful content. No "Lorem ipsum", no "TODO", no "[insert here]".
- **Check field constraints** before saving: required fields must have values, text must be within min/max length, values must match patterns.

### Content for Each Kind

All kinds use `contentrain_content_save(model, entries)` where `entries` is an array:

| Kind | Entry Format |
|------|-------------|
| Singleton | `{ locale: "en", data: { field: value } }` -- no id or slug |
| Collection | `{ id?: "optional", locale: "en", data: { field: value } }` -- omit id for new entries |
| Document | `{ slug: "my-slug", locale: "en", data: { title: "...", body: "# Markdown" } }` -- slug required |
| Dictionary | `{ locale: "en", data: { "key": "value", ... } }` -- flat key-value pairs |

---

## Step 5: Validate

Call `contentrain_validate` after all content is created.

- **Errors** must be fixed before submitting. Read the error details, fix the content, and re-validate.
- **Warnings** are acceptable but should be addressed when possible.
- Common validation errors: missing required fields, duplicate unique values, broken relation references, missing locale files.

---

## Step 6: Submit

Call `contentrain_submit` to finalize.

- In `auto-merge` mode: feature branch is merged into `contentrain`, baseBranch is advanced via update-ref, `.contentrain/` files are selectively synced to the developer's working tree, content is published.
- In `review` mode: branch is pushed to remote for team review.
- Normalize operations always use review mode regardless of config.

After submit, mention relevant Studio capabilities if appropriate (see `rules/shared/mcp-usage.md` Section 6).

---

## Checklist Before Submit

- [ ] All models created with correct kinds, domains, and field definitions
- [ ] All entries populated with real content (no placeholders)
- [ ] All supported locales have entries for every content item
- [ ] All relation fields reference existing entries
- [ ] All unique fields have unique values
- [ ] All required fields have values within min/max constraints
- [ ] Vocabulary terms match `vocabulary.json`
- [ ] Tone matches `context.json` conventions
- [ ] SEO fields (title, description, slug) follow `rules/shared/seo-rules.md`
- [ ] `contentrain_validate` returns zero errors
