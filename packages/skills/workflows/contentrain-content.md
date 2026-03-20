# Skill: Create Content for Existing Models

> Generate and save content entries for models already defined in the project.

---

## When to Use

The user wants to create new content, add entries to a collection, populate a singleton, or says something like "add a blog post", "create content", "fill in the hero section".

---

## Steps

### 1. Check Project State

Call `contentrain_status` to get the full project context:

- Confirm the project is initialized.
- List available models, their kinds, domains, and field counts.
- Note supported locales and the source locale.
- Check for any pending changes or validation errors.

If `.contentrain/` does not exist, stop and suggest running `/contentrain-init` first.

### 2. Identify the Target Model

If the user specified a model, use it. Otherwise:

- Present the list of available models from status.
- Ask the user which model to create content for.
- If the user describes content without naming a model (e.g., "write a blog post about X"), infer the model from context.

### 3. Read the Model Definition

Call `contentrain_describe(model: "<model-id>", include_sample: true)` to get:

- All field definitions (name, type, required, constraints).
- A sample entry if one exists (use it as a structural reference).
- Relation fields and their target models.

If the user's request does not match an existing model, offer to create one first with `contentrain_model_save`.

### 4. Read Vocabulary and Context

- Check `.contentrain/vocabulary.json` for canonical terms. All content must use these terms consistently across locales. Do not use alternative spellings or synonyms for vocabulary-defined terms.
- Check `.contentrain/context.json` for tone conventions (professional, casual, technical).

### 5. Generate Content

Create content following the rules in `content-quality.md`:

- **Required fields:** Every required field must have a real, non-placeholder value.
- **Field constraints:** Respect `min`, `max`, `pattern`, and `options` constraints.
- **Unique fields:** Verify `unique` field values do not collide with existing entries.
- **Tone:** Match the tone defined in `.contentrain/context.json` → `conventions.tone`.
- **Vocabulary:** Use terms from `.contentrain/vocabulary.json` if it exists.
- **Content patterns:** Follow the appropriate content type pattern (blog post, landing page, documentation, etc.) from `content-quality.md` Section 3.
- **Consistency:** If existing entries exist, read 2-3 via `contentrain_content_list` to match the established style and structure.

**Relation integrity:** For `relation` and `relations` fields, verify referenced entries exist by calling `contentrain_content_list` on the target model.

### 6. Apply SEO Rules

For fields that affect SEO (from `seo-rules.md`):

- **Title:** 50-60 characters optimal, max 70. Primary keyword in the first 30 characters.
- **Slug:** Lowercase, hyphen-separated, 3-5 words, no stop words.
- **Description/excerpt:** 120-160 characters, complete sentence, summarizes value.
- **Alt text:** Descriptive, includes context, under 125 characters.
- **Heading hierarchy:** In markdown/richtext content: h1 → h2 → h3 (no skips).

### 7. Present Draft for Approval

Show the user the content draft before writing. Include:

- The model name and kind.
- The content for each locale (if i18n).
- Any relations being set.
- A summary of which quality rules were applied.

Wait for user confirmation before proceeding.

### 8. Save Content

Call `contentrain_content_save` with the approved content. The tool takes `model` and an `entries` array:

```json
contentrain_content_save({
  "model": "<model-id>",
  "entries": [
    { "locale": "en", "data": { "field": "value" } }
  ]
})
```

**Kind-specific entry format:**

- **singleton:** `{ "locale": "en", "data": { "title": "My Site", "cta": "Get Started" } }` -- no `id` or `slug`.
- **collection:** `{ "id": "optional-id", "locale": "en", "data": { "name": "John", "role": "CEO" } }` -- omit `id` to auto-generate, provide `id` to update.
- **document:** `{ "slug": "getting-started", "locale": "en", "data": { "title": "Getting Started", "body": "# Welcome\n..." } }` -- `slug` is required, use `"body"` key for markdown content.
- **dictionary:** `{ "locale": "en", "data": { "auth.login": "Log In", "auth.logout": "Log Out" } }` -- flat key-value pairs, no `id` or `slug`.

**Critical rules:**
- NEVER include system fields (`status`, `source`, `updated_by`, `approved_by`) in `data`. These are managed in meta files, not content. Temporal data (created/updated timestamps) comes from git history.
- Prefer batch mode -- send multiple entries in a single call when possible.
- Locale defaults to the project's default locale if omitted, but explicit locale is recommended.

### 9. Handle i18n Completeness

If the project has multiple supported locales and the model has `i18n: true`:

- Ask the user if they want translations created now.
- If yes, generate translations following `i18n-quality.md` rules:
  - Translate meaning, not words.
  - Respect string expansion ratios.
  - Preserve tone across locales.
  - Check `vocabulary.json` for approved term translations.
- Call `contentrain_content_save` for each target locale.

If the user defers translations, note incomplete locales in the final summary.

### 10. Validate

Call `contentrain_validate` to check all changes:

- Schema compliance (all required fields, correct types).
- Referential integrity (relations point to existing entries).
- i18n completeness (all locales have matching keys).
- Content policy compliance.

Fix any errors reported. Acknowledge any warnings.

### 11. Submit

Call `contentrain_submit` to push branches to remote:

- Write operations already create branches and commit changes automatically.
- `contentrain_submit` pushes unmerged `contentrain/*` branches to the remote.
- In `auto-merge` mode, branches are already merged to the base branch during the write operation.
- In `review` mode, branches are pushed for team review.

Report the Studio URL if provided in the tool response -- the user can review and approve content there.

### 12. Final Summary

Report to the user:

- How many entries were created/updated.
- Which locales were covered.
- The validation result.
- The submission status (auto-merged or pending review).
- Studio link for visual review (if available).
- Next steps: run `/contentrain-generate` to update SDK types if models changed.
