---
name: contentrain
description: "Contentrain CMS architecture, content formats, and MCP tool usage. Use when working with .contentrain/ directory, content models, or Contentrain MCP tools."
metadata:
  author: Contentrain
  version: "1.0.0"
---

# Contentrain Skill

Contentrain is a Git-based, AI-first content management system. Content lives in `.contentrain/` as JSON and Markdown files, managed through MCP tools. This skill covers architecture, content formats, and tool usage.

## Architecture: Agent vs MCP

The system separates **intelligence** (agent) from **infrastructure** (MCP tools).

**Agent responsibilities:**
- Analyze the project (tech stack, architecture, existing patterns)
- Decide what constitutes content vs code
- Assign domain grouping and model structure
- Create replacement expressions (stack-aware: `{t('key')}` vs `{{ $t('key') }}`)
- Make all semantic and content decisions

**MCP responsibilities:**
- Build project graph (import/component relationships)
- Find string candidates (regex + filter)
- Read/write/delete content and models
- Patch source files (exact string replacement)
- Validate against schema rules
- Manage Git transactions (worktree, branch, commit, merge/push)

**Rule:** MCP does NOT make content decisions. It provides reliable, framework-agnostic tooling.

## Four Model Kinds

| Kind | Storage | Use For |
|------|---------|---------|
| **Singleton** | JSON object, one file per locale | Page sections, site config, navigation |
| **Collection** | Object-map by entry ID (sorted keys) | Team members, products, FAQs, categories |
| **Document** | Markdown + YAML frontmatter | Blog posts, documentation, changelogs |
| **Dictionary** | Flat key-value (all strings, no fields) | Error messages, UI strings, translations |

### Storage Examples

**Singleton** (`content/{domain}/{model}/{locale}.json`):
```json
{ "cta": "Get Started", "title": "Build faster" }
```

**Collection** (`content/{domain}/{model}/{locale}.json`):
```json
{
  "a1b2c3d4e5f6": { "name": "Ahmet", "role": "CEO" },
  "f6e5d4c3b2a1": { "name": "Jane", "role": "CTO" }
}
```

**Document** (`content/{domain}/{model}/{slug}/{locale}.md`):
```markdown
---
title: Getting Started
slug: getting-started
---
# Getting Started with Contentrain
```

**Dictionary** (`content/{domain}/{model}/{locale}.json`):
```json
{ "auth.expired": "Session expired", "auth.failed": "Authentication failed" }
```

## Content Format Essentials

- **Canonical serialization:** Keys sorted lexicographically, 2-space indent, UTF-8, trailing newline, omit nulls/defaults
- **System fields** (auto-managed, never set manually): `id` (collection), `slug` (document), `createdAt`/`updatedAt` (Git-derived), `status`/`source`/`updated_by`/`approved_by` (metadata)
- **IDs:** 12-char hex, auto-generated for collections
- **Object-map rationale:** Sorted keys produce predictable diffs, minimize Git merge conflicts

## MCP Tool Catalog

| Tool | Purpose |
|------|---------|
| `contentrain_status` | Get full project state in one call |
| `contentrain_describe` | Get schema + optional sample for one model |
| `contentrain_describe_format` | Get storage and file-format contract |
| `contentrain_init` | Initialize `.contentrain/` directory |
| `contentrain_scaffold` | Generate models from built-in template |
| `contentrain_model_save` | Create or update a model definition (upsert) |
| `contentrain_model_delete` | Delete a model and its content |
| `contentrain_content_save` | Create or update content entries (upsert) |
| `contentrain_content_delete` | Delete a content entry |
| `contentrain_content_list` | List content entries for a model |
| `contentrain_scan` | Scan project for structure or content candidates |
| `contentrain_apply` | Apply normalize operation (extract or reuse) |
| `contentrain_validate` | Validate content against model schemas |
| `contentrain_submit` | Push contentrain/* branches to remote |
| `contentrain_bulk` | Run batch operations on existing content |

## Calling Sequences

### Generate (New Project)
```
status --> init --> scaffold? --> model_save --> content_save --> validate --> submit
```

### Existing Project
```
status --> describe --> content_save --> validate --> submit
```

### Normalize Phase 1 (Extraction)
```
status --> init? --> scan(graph) --> scan(candidates) --> [agent evaluates]
  --> apply(extract, dry_run:true) --> [review] --> apply(extract, dry_run:false)
  --> validate --> submit
```

### Normalize Phase 2 (Reuse)
```
apply(reuse, dry_run:true) --> [review] --> apply(reuse, dry_run:false)
  --> validate --> submit --> [repeat per model]
```

## Key Guardrails

1. **Always call `contentrain_status` first** when working with an existing project
2. **Always call `contentrain_describe_format` before creating models or content** to understand storage formats
3. **Always `dry_run: true` first** for any `contentrain_apply` operation, review, then `dry_run: false`
4. **Always `contentrain_validate` before `contentrain_submit`** -- fix errors before submitting
5. **Dictionary = flat key-value, all strings, no fields, no id/slug** -- keys are semantic addresses
6. **Collection = object-map by entry ID, typed fields** -- IDs are auto-generated 12-char hex
7. **Never write to `.contentrain/meta/`, `.contentrain/client/`, or `.contentrain/context.json`** directly
8. **Normalize branches always use review workflow** -- never auto-merge
9. **MCP is deterministic infra, agent is intelligence** -- MCP does NOT make content decisions
10. **Batch related changes** before validate/submit -- do not submit after every save

## References

| Reference | Description |
|-----------|-------------|
| [Schema Types](references/schema-types.md) | Complete 27-type catalog with field properties |
| [Model Kinds](references/model-kinds.md) | Detailed storage formats, relations, nesting rules |
| [Content Formats](references/content-formats.md) | Directory structure, config.json, canonical serialization |
| [MCP Tools](references/mcp-tools.md) | Complete tool parameters and usage details |
| [MCP Pipelines](references/mcp-pipelines.md) | Calling sequences, error handling, Studio hints |
| [Architecture](references/architecture.md) | Full Contentrain schema and type architecture |
| [i18n](references/i18n.md) | Internationalization quality rules |
| [Security](references/security.md) | XSS prevention, secret detection, URL validation |
| [Workflow](references/workflow.md) | Git workflow, branch naming, conflict resolution |
