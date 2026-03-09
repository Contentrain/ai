---
name: contentrain
description: >
  Use this skill when a developer needs to manage Contentrain models, fields, content, and assets
  manually from the repository (IDE + Git) after initial project setup in Contentrain Web App.
  TRIGGER when: code imports contentrain, user references contentrain/ directory,
  user asks to create/edit/delete Contentrain models or content, any content management task
  in a project that has a contentrain/ directory.
  DO NOT TRIGGER when: code imports openai/other AI SDK, general programming,
  project does not have a contentrain/ directory.
version: 1.0.0
---

# Contentrain Content Management

This skill enables AI agents to manage Contentrain CMS content data directly from repository files.

## Activation

This skill activates when:
- The project has a `contentrain/` directory
- User asks to create, edit, delete, or list Contentrain models, fields, content, or assets
- User references `contentrain/` files or content operations
- Any content management task in a Contentrain-enabled project

## Strategy: MCP vs Direct Editing

**If MCP tools are available** (e.g., `contentrain_list_models`), always prefer them. They handle git sync, validation, ID generation, and conflict resolution automatically.

**If MCP tools are NOT available**, edit files directly following the rules below.

## Project Structure

```
contentrain.json                     # { "assetsPath": "contentrain/static" }
contentrain/
  assets.json                        # Asset registry (array)
  models/
    metadata.json                    # Model list (array)
    <modelId>.json                   # Field definitions (array)
  <modelId>/
    <modelId>.json                   # Non-localized content (array)
    <lang>.json                      # Localized content (array)
```

## Workflow

1. **Discover**: Read `contentrain/models/metadata.json` to understand existing models
2. **Inspect**: Read `contentrain/models/<modelId>.json` to see field definitions
3. **Confirm**: Describe planned changes to the user before executing
4. **Execute**: Apply changes following ALL rules below
5. **Validate**: Check the validation checklist before finishing

## ID Format

12-character lowercase hexadecimal: `[a-f0-9]{12}`

Example: `50d81f2a3baf`, `9450777bee2f`, `d00761480436`

IDs must be unique within a model and consistent across all locale files for the same entry.

## System Fields

Every content entry requires:

| Field | Type | Rule |
|-------|------|------|
| `ID` | string | 12-char hex, set once, never change |
| `createdAt` | string | ISO 8601, set once on create, never modify |
| `updatedAt` | string | ISO 8601, update on every edit |
| `status` | string | `"draft"`, `"publish"`, or `"changed"` |

## Model Metadata

Entry in `contentrain/models/metadata.json`:

```json
{
  "name": "Display Name",
  "modelId": "kebab-case-id",
  "localization": true,
  "type": "JSON",
  "createdBy": "user",
  "isServerless": false
}
```

- `type`: `"JSON"`, `"MD"`, or `"MDX"`
- `modelId`: kebab-case, unique

## Field Definitions

File: `contentrain/models/<modelId>.json` — array of field objects.

Every model MUST include 4 system fields (`createdAt`, `updatedAt`, `ID`, `status`) with `"system": true`.

For MD/MDX models, also include `slug` and `content` fields with `"defaultField": true`.

### Component Reference

| fieldType | componentId | Runtime value |
|-----------|-------------|---------------|
| `string` | `single-line-text`, `multi-line-text`, `email`, `url`, `slug`, `color`, `json`, `md-editor`, `rich-text-editor` | `string` |
| `number` | `integer`, `decimal`, `rating`, `percent` | `number` |
| `number` | `phone-number` | `string` (not number!) |
| `boolean` | `checkbox`, `switch` | `boolean` |
| `date` | `date`, `date-time` | `string` (ISO 8601) |
| `media` | `media` | `string` (asset path) |
| `relation` | `one-to-one` | `string` (entry ID) |
| `relation` | `one-to-many` | `string[]` (entry IDs) |

### Relation Options Format

```json
{
  "options": {
    "reference": {
      "value": true,
      "form": { "reference": { "value": "<target-modelId>" } }
    }
  }
}
```

## Content Rules

### JSON Models
- Non-localized: `contentrain/<modelId>/<modelId>.json`
- Localized: `contentrain/<modelId>/<lang>.json` (e.g., `en.json`, `tr.json`)

### MD/MDX Models
Two synchronized layers:
1. **JSON index**: all fields except body content
2. **Markdown file**: YAML frontmatter + body content

Never store `content` body in the JSON index.

Markdown path: `<model.path>/<slug>.md` or `<model.path>/<lang>/<slug>.md`

## Asset Management

File: `contentrain/assets.json` (not `asset.json`)

```json
{
  "path": "contentrain/static/hero.png",
  "mimetype": "image/png",
  "size": 18342,
  "alt": "Hero image",
  "meta": {
    "user": { "name": "Name", "email": "email@example.com" },
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

- Physical file must exist at `path`
- `media` fields store the `path` string

## Environment Branches

Contentrain uses git branches for environments:
- `contentrain` → default environment
- `contentrain-staging` → staging
- `contentrain-production` → production

Always apply changes to the correct environment branch.

## Validation Checklist

Before finishing, verify:
- [ ] All JSON files are valid (no trailing commas, no comments)
- [ ] All IDs are 12-char lowercase hex and unique
- [ ] Required fields are present
- [ ] `createdAt` was NOT modified on updates
- [ ] `updatedAt` was refreshed on updates
- [ ] Relations reference existing entries
- [ ] Media paths exist in `assets.json`
- [ ] Localized entries share the same ID across all language files
- [ ] MD/MDX: JSON index and markdown file are in sync
- [ ] Changes are on the correct environment branch

## Common Mistakes to Avoid

1. Using `asset.json` instead of `assets.json`
2. Using `models.json` instead of `models/metadata.json`
3. Storing markdown body in MD/MDX JSON index
4. Storing `phone-number` as a number (should be string)
5. Using different IDs across locale files for the same entry
6. Generating UUIDs instead of 12-char hex IDs
7. Forgetting to update `updatedAt` on edits
8. Missing `options.reference.form.reference.value` on relation fields
