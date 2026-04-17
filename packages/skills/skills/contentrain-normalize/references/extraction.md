---
name: extraction
description: "Phase 1 extraction details, rules, and examples"
---

# Phase 1: Extraction Details

Extraction pulls hardcoded content from source code into `.contentrain/` without modifying source files. Each extraction produces a single branch with all extracted content for review.

---

## Extraction Flow

### 1. Build Project Graph

```
contentrain_scan(mode: "graph")
```

Returns the import/component dependency graph. Use this to:

- Understand which components belong to which pages or features.
- Identify shared components vs page-specific components.
- Prioritize files by their role in the project (layout, page, component).

### 2. Find Candidates

```
contentrain_scan(mode: "candidates")
```

Returns hardcoded string candidates with file paths, line numbers, and surrounding context. Review candidates by file -- not all strings should be extracted. See [What Is Content](what-is-content.md) for filtering heuristics.

### 3. Agent Evaluation

This is the intelligence step -- the agent makes all decisions:

- **Filter false positives:** Remove CSS values, technical identifiers, import paths, variable names, config values, log messages, and test strings.
- **Assign domains:** Group candidates by domain (e.g., `marketing`, `blog`, `ui`, `system`).
- **Determine model types:** Choose the appropriate model kind for each group:
  - **dictionary** -- UI strings, button labels, error messages. Flat key-value, all strings, no field schema.
  - **singleton** -- Page-specific content with structured fields (hero section, features block).
  - **collection** -- Repeating items with structured fields (testimonials, FAQs, team members).
  - **document** -- Long-form content with markdown body and typed metadata (blog posts, docs).
- **Structure fields:** Define field names and assign candidate strings to fields.

### 4. Write Normalize Plan

After evaluation, write the plan as `.contentrain/normalize-plan.json`:

```json
{
  "version": 1,
  "status": "pending",
  "created_at": "2026-03-16T12:00:00.000Z",
  "agent": "claude",
  "scan_stats": {
    "files_scanned": 42,
    "raw_strings": 320,
    "candidates_sent": 85,
    "extracted": 28,
    "skipped": 57
  },
  "models": [
    {
      "id": "hero-section",
      "kind": "singleton",
      "domain": "marketing",
      "i18n": true,
      "fields": {
        "title": { "type": "string", "required": true },
        "subtitle": { "type": "string" }
      }
    }
  ],
  "extractions": [
    {
      "value": "Build faster apps",
      "file": "src/pages/index.vue",
      "line": 12,
      "model": "hero-section",
      "field": "title"
    }
  ],
  "patches": [
    {
      "file": "src/pages/index.vue",
      "line": 12,
      "old_value": "Build faster apps",
      "new_expression": "{{ $t('hero.title') }}"
    }
  ]
}
```

This file is watched by the serve UI -- writing it triggers automatic detection.

### 5. Preview Extraction

```
contentrain_apply(mode: "extract", dry_run: true)
```

Returns a preview of what will be created in `.contentrain/` without making changes. Review the output:

- Verify models are structured correctly.
- Verify content assignments are accurate.
- Check for missing or misclassified candidates.

### 6. Execute Extraction

```
contentrain_apply(mode: "extract", dry_run: false)
```

Creates model definitions and content files in `.contentrain/` on a `cr/normalize/extract/{timestamp}` branch. `dry_run` defaults to `true`, so you MUST explicitly set `dry_run: false` to execute.

### 7. Validate and Submit

```
contentrain_validate
contentrain_submit
```

Submit always uses `review` mode for normalize operations.

---

## Extraction Rules

- Extraction creates content in `.contentrain/` but does NOT modify source files.
- Each extraction produces a single branch with all extracted content.
- Group related content into the fewest models that make semantic sense.
- Prefer **dictionary** kind for UI labels and error messages.
- Prefer **singleton** kind for page-specific content (hero, features).
- Prefer **collection** kind for repeating items (team members, FAQs, testimonials).
- Prefer **document** kind for long-form content with markdown body.

---

## Group Related Content Guidelines

When grouping candidates into models:

- Content from the same page section should go into the same model.
- Shared UI strings (navigation, footer, error messages) should be grouped into a single dictionary per domain.
- Do not create one model per component -- group related content into shared models.
- Use the project graph to understand component relationships and group accordingly.
- If multiple components share the same type of content (e.g., all cards have a title and description), consider a single collection model.

---

## Content Format Reference

Understand these formats before choosing model kinds:

| Kind | Format | Keys | Example Path |
|------|--------|------|-------------|
| Dictionary | Flat key-value JSON, all strings | Semantic dot-separated addresses | `{model-id}/{locale}.json` |
| Collection | Object-map JSON by 12-char hex ID | Auto-generated entry IDs | `{model-id}/{locale}.json` |
| Singleton | Single JSON object per locale | Typed field names | `{model-id}/{locale}.json` |
| Document | Markdown with frontmatter per slug | Slug-based file names | `{model-id}/{slug}/{locale}.md` |

Call `contentrain_describe_format` before deciding model structure to see the exact format for each kind.
