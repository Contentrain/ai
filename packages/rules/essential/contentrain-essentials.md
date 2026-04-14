# Contentrain — Essential Rules

This project uses Contentrain for AI-driven content management. These rules are mandatory.

## Architecture

MCP is **deterministic infrastructure**. The agent (you) is the **intelligence layer**.

- **Agent decides:** what is content vs code, domain grouping, model structure, replacement expressions (stack-aware), content quality
- **MCP handles:** file I/O, validation, Git transactions (dedicated contentrain branch/worktree/commit/update-ref), project scanning
- MCP does NOT make content decisions. It is framework-agnostic.

## Four Model Kinds

| Kind | Storage | Use For |
|------|---------|---------|
| **singleton** | One JSON object per locale | Page sections, site config, navigation |
| **collection** | Object-map by entry ID (sorted keys) | Team members, FAQs, products, categories |
| **document** | Markdown with frontmatter, per slug per locale | Blog posts, docs, changelogs |
| **dictionary** | Flat key-value (all strings), NO fields, NO id/slug | UI strings, error messages, translations |

## Content Format Rules

- **JSON only** — no YAML (except document frontmatter)
- **Canonical serialization:** sorted keys, 2-space indent, UTF-8, trailing newline, omit nulls
- **Collection IDs:** auto-generated 12-char hex, used as object-map keys (NOT stored inside entry)
- **Dictionary keys:** dot-notation, semantic, English (`auth.login.button`)

## Critical Boundaries

- **NEVER** write to `.contentrain/meta/` — system-managed metadata
- **NEVER** edit `.contentrain/client/` — auto-generated SDK
- **NEVER** edit `.contentrain/context.json` — MCP writes, agents read
- **NEVER** include system fields in content data: `id`, `status`, `source`, `updated_by`, `updated_at`, `createdAt`, `updatedAt`
- **ALWAYS** use MCP tools — do not write `.contentrain/` JSON files directly

## MCP Tools

| Tool | Purpose |
|------|---------|
| `contentrain_status` | Full project state (call FIRST in every session) |
| `contentrain_describe` | Schema + sample for one model |
| `contentrain_describe_format` | Storage format contract (call BEFORE creating models) |
| `contentrain_init` | Initialize `.contentrain/` directory |
| `contentrain_scaffold` | Generate models from template |
| `contentrain_model_save` | Create/update model definition (upsert) |
| `contentrain_model_delete` | Delete model (checks referential integrity) |
| `contentrain_content_save` | Create/update content entries (upsert) |
| `contentrain_content_delete` | Delete content entry |
| `contentrain_content_list` | List entries for a model |
| `contentrain_scan` | Scan project (graph/candidates/summary) |
| `contentrain_apply` | Apply normalize (extract/reuse) |
| `contentrain_validate` | Validate content against schemas |
| `contentrain_submit` | Push branches to remote |
| `contentrain_merge` | Merge a review-mode branch into contentrain locally |
| `contentrain_bulk` | Batch operations (copy_locale/update_status/delete_entries) |

## Mandatory Protocols

1. **Status first** — ALWAYS call `contentrain_status` before any operation on an existing project
2. **Describe format first** — ALWAYS call `contentrain_describe_format` before creating models or content
3. **Dry run first** — ALWAYS use `dry_run: true` before any `contentrain_apply`, review output, then `dry_run: false`
4. **Validate before submit** — ALWAYS call `contentrain_validate` before `contentrain_submit`
5. **Batch changes** — group related saves, validate once, submit once
6. **Normalize = review** — normalize operations ALWAYS use review workflow, never auto-merge

## Git Workflow

- A dedicated `contentrain` branch is the single source of truth for content state, created at init
- Every write operation creates a temporary worktree on the `contentrain` branch automatically
- Feature branches (`contentrain/{operation}/{model}/{locale}/{timestamp}`) are created from `contentrain` for each operation
- **auto-merge** mode: feature branch merges into `contentrain`, then `contentrain` advances baseBranch via update-ref (fast-forward), then `.contentrain/` files are selectively synced to the developer's working tree
- **review** mode: feature branch pushed to remote for team review
- Developer's working tree is never mutated during MCP git operations (no stash, no checkout, no merge on the developer's tree)
- If the developer manually edits `.contentrain/` files, MCP sync skips dirty files and warns
- The `contentrain` branch is protected from deletion
- context.json is committed together with content changes, not as a separate commit
- Never create branches manually, never commit directly to main or the `contentrain` branch
- 50+ active branches = warning, 80+ = blocked

## CLI Serve — Review & Approval

Normalize and review workflows often need browser-based approval:

```bash
contentrain serve  # starts http://localhost:3333
```

Key pages: `/normalize` (extraction approval), `/branches` (merge/delete), `/validate` (error review), `/content` (browse).

Agent should start or ensure serve is running when:
- Normalize extraction needs user approval
- Multiple branches await review
- Validation errors need visual inspection

Branch merge options: CLI serve UI (localhost:3333/branches), `contentrain_merge` MCP tool, or git platform PR.

## SDK Regeneration

After model/content changes or normalize reuse, run:

```bash
npx contentrain generate
```

This regenerates `.contentrain/client/` — required for `#contentrain` imports to work.

## Localization

- All supported locales must have entries for every content item
- Collection entry IDs and dictionary keys must match across all locales
- IDs and slugs are locale-agnostic — same reference works everywhere

## Security

- No `<script>`, `javascript:`, or event handlers in richtext/markdown
- No secrets (API keys, tokens, passwords) in any content field
- URLs must use `https://` (except localhost). No `file://`, no path traversal
- Media paths must be relative to `assets_path`, no absolute system paths
