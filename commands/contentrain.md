---
description: Manage Contentrain CMS models, content, and assets. Works with MCP tools (if available) or direct file editing.
argument-hint: <action> [details]
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, mcp__contentrain__contentrain_list_models, mcp__contentrain__contentrain_describe_model, mcp__contentrain__contentrain_create_model, mcp__contentrain__contentrain_add_field, mcp__contentrain__contentrain_delete_model, mcp__contentrain__contentrain_list_content, mcp__contentrain__contentrain_get_content, mcp__contentrain__contentrain_create_content, mcp__contentrain__contentrain_update_content, mcp__contentrain__contentrain_delete_content, mcp__contentrain__contentrain_validate, mcp__contentrain__contentrain_list_assets, mcp__contentrain__contentrain_register_asset, mcp__contentrain__contentrain_deregister_asset]
---

# Contentrain Content Management

Manage Contentrain CMS models, content, and assets.

## User Request

$ARGUMENTS

## Strategy

**Check for MCP tools first.** If `contentrain_list_models` or similar MCP tools are available, prefer them — they handle git sync, validation, and ID generation automatically.

If MCP tools are NOT available, fall back to direct file editing using the rules below.

## MCP Mode (Preferred)

When MCP tools are available, use this workflow:

1. `contentrain_list_models` → understand project structure
2. `contentrain_describe_model` → get field schema before creating/updating content
3. `contentrain_validate` → dry-run validation before writes
4. `contentrain_create_content` / `contentrain_update_content` / `contentrain_delete_content` → mutations
5. `contentrain_create_model` / `contentrain_add_field` → schema changes

MCP tools handle: ID generation, timestamps, git worktree isolation, commit, push, structural merge on conflicts.

## Direct File Editing Mode (Fallback)

When MCP tools are not available, edit files directly in the `contentrain/` directory.

### File Structure

```
contentrain.json                   # { "assetsPath": "contentrain/static" }
contentrain/
  assets.json                      # Asset registry
  models/
    metadata.json                  # Model list
    <modelId>.json                 # Field definitions
  <modelId>/
    <modelId>.json                 # Non-localized content
    <lang>.json                    # Localized content (en.json, tr.json, etc.)
```

### ID Format

12-character lowercase hexadecimal: `[a-f0-9]{12}` (e.g., `50d81f2a3baf`).

Generate by taking the last segment of a UUID: split UUID by `-` and use the last 12 chars.

### System Fields (auto-managed)

Every content entry MUST have:
- `ID`: 12-char hex, unique, consistent across all locale files
- `createdAt`: ISO 8601 string, set once on create, never modified
- `updatedAt`: ISO 8601 string, updated on every edit
- `status`: `"draft"` | `"publish"` | `"changed"`
- `scheduled`: `false` (optional, add only if already present in existing data)

### Model Definition

Each model needs an entry in `metadata.json`:
```json
{ "name": "Display Name", "modelId": "kebab-case-id", "localization": false, "type": "JSON", "createdBy": "user", "isServerless": false }
```

And a field file at `models/<modelId>.json` with system fields + custom fields.

**Required system fields** (add to every model):
```json
[
  { "name": "createdAt", "fieldId": "createdAt", "componentId": "date", "options": {}, "validations": { "required-field": { "value": true } }, "fieldType": "date", "system": true, "defaultField": false, "modelId": "<modelId>" },
  { "name": "updatedAt", "fieldId": "updatedAt", "componentId": "date", "options": {}, "validations": { "required-field": { "value": true } }, "fieldType": "date", "system": true, "defaultField": false, "modelId": "<modelId>" },
  { "name": "ID", "fieldId": "ID", "componentId": "single-line-text", "options": {}, "validations": { "required-field": { "value": true } }, "fieldType": "string", "system": true, "defaultField": false, "modelId": "<modelId>" },
  { "name": "status", "fieldId": "status", "componentId": "single-line-text", "options": {}, "validations": { "required-field": { "value": true } }, "fieldType": "string", "system": true, "defaultField": false, "modelId": "<modelId>" }
]
```

For MD/MDX models, also add `slug` and `content` default fields.

### Component Types

| fieldType | componentId options |
|-----------|-------------------|
| `string` | `single-line-text`, `multi-line-text`, `email`, `url`, `slug`, `color`, `json`, `md-editor`, `rich-text-editor` |
| `number` | `integer`, `decimal`, `rating`, `percent`, `phone-number` (stored as string!) |
| `boolean` | `checkbox`, `switch` |
| `date` | `date`, `date-time` |
| `media` | `media` (stores asset path string) |
| `relation` | `one-to-one` (string ID), `one-to-many` (string[] IDs) |

### Relation Format
```json
{ "options": { "reference": { "value": true, "form": { "reference": { "value": "<target-modelId>" } } } } }
```

### MD/MDX Rules

- JSON index file: all fields EXCEPT body content
- `.md`/`.mdx` file: YAML frontmatter (all fields) + body content
- Never store `content` body in JSON index
- Path: `<model.path>/<slug>.md` or `<model.path>/<lang>/<slug>.md`

### Validation Before Commit

- All JSON files are valid
- All IDs are 12-char hex and unique
- Required fields are present
- Relations reference existing entries
- Media paths exist in `assets.json`
- Localized entries have same ID across all language files
- Changes are on the correct environment branch
