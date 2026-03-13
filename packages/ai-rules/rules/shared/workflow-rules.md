# Contentrain Workflow Rules

> These rules govern how content changes flow through the Git-based workflow, including branching, validation, review, and status management.

---

## 1. Two Workflow Modes

Contentrain supports two workflow modes, configured in `.contentrain/config.json` under the `workflow` field.

### 1.1 auto-merge

```json
{ "workflow": "auto-merge" }
```

- Branch is created, changes are committed, branch is **automatically merged to main**.
- No review step -- changes go live immediately.
- Best for: solo developers, rapid iteration, prototyping, vibe coding.
- Status flow: `draft` --> `published` (skips `in_review`).

### 1.2 review

```json
{ "workflow": "review" }
```

- Branch is created, changes are committed, branch is **pushed to remote**.
- Studio or team reviews the changes before merging.
- Best for: teams, content governance, production environments.
- Status flow: `draft` --> `in_review` --> `published` | `rejected`.

### 1.3 Mode Selection Rules

- Default is `auto-merge` -- minimal friction for getting started.
- Switch to `review` as the project or team grows and governance becomes important.
- **Normalize operations ALWAYS use `review` mode** regardless of the config setting. Normalize changes are never auto-merged.

---

## 2. Branch Naming Convention

All Contentrain branches follow a strict naming pattern:

```
contentrain/{operation}/{model}/{locale}/{timestamp}
```

### Examples

| Scenario | Branch Name |
|----------|-------------|
| Content update | `contentrain/content/blog-post/en/1710300000` |
| Model creation | `contentrain/model/team-member/1710300000` |
| Normalize extraction | `contentrain/normalize/extract/blog/1710300000` |
| Normalize reuse | `contentrain/normalize/reuse/marketing-hero/en/1710300000` |
| Scaffold | `contentrain/new/scaffold-landing/en/1710300000` |

### Rules

- Branches are created automatically by MCP tools. Do NOT create them manually.
- The `{timestamp}` component ensures uniqueness.
- `{locale}` is included when the operation is locale-specific.
- `{model}` is included when the operation targets a specific model.

---

## 3. Git Workflow

### 3.1 Worktree-Based Transactions

Every write operation follows this flow:

1. MCP creates a **Git worktree** on a new branch.
2. Changes are made in the worktree (content files, model files).
3. Changes are committed to the branch.
4. **auto-merge mode:** Branch is merged to main. Worktree is cleaned up.
5. **review mode:** Branch is pushed to remote. Worktree is cleaned up. Studio notifies reviewers.

### 3.2 Critical Rules

- **NEVER commit directly to main.** All changes go through branches.
- **NEVER create branches manually.** MCP tools handle all Git operations.
- **NEVER force-push or rebase** Contentrain branches.
- Worktrees are temporary. They are created for the operation and cleaned up afterward.
- Each branch contains a cohesive set of changes (e.g., all entries for one model update).

### 3.3 Branch Lifecycle

```
Created (worktree) --> Committed --> Merged/Pushed --> Cleaned up
                                         |
                                         v
                            auto-merge: merged to main
                            review: pushed to remote, awaiting review
```

Merged branches are retained for `branchRetention` days (default: 30) for audit trail, then pruned.

### 3.4 Branch Health

MCP enforces branch health limits to prevent branch accumulation:

- **50+ active branches**: Warning. Operations continue but the user is alerted.
- **80+ active branches**: Blocked. No new write operations until branches are merged or deleted.
- `contentrain_status` reports branch health automatically (total, merged, unmerged counts).
- Merged branches are cleaned up lazily during status checks and submit operations.

---

## 4. Conflict Resolution

### 4.1 How Conflicts Are Minimized

Contentrain's storage format is designed to minimize Git merge conflicts:

- **Object-map storage** for collections: each entry is a separate key-value pair. Two branches adding different entries rarely conflict.
- **Canonical serialization**: sorted keys and deterministic formatting prevent artificial diffs.
- **Review mode for normalize**: separate branches for extraction and reuse reduce concurrent editing conflicts.

### 4.2 When Conflicts Occur

| Scenario | Likelihood | Resolution |
|----------|-----------|------------|
| Different fields on the same entry | Low | Auto-merge succeeds (JSON field-level merge) |
| Same field changed by two branches | Medium | Studio conflict resolution UI |
| Two entries added with adjacent IDs | Very low | Auto-merge usually succeeds |
| Concurrent normalize operations | Avoided | Always review mode, sequential per model |

### 4.3 Conflict Resolution Rules

- Field-level merge for JSON: if the same entry has different fields changed in two branches, Git auto-merges.
- Same field changed by multiple branches creates a conflict requiring Studio resolution.
- When a conflict occurs, the agent should NOT attempt to resolve it. Inform the user and direct them to Studio.
- Collection object-map format with sorted keys means ~0.3% chance of conflict for two new entries in a 350-entry collection.

---

## 5. Workflow States

Content entries move through these states:

```
draft --> in_review --> published
              |
              v
          rejected (with feedback)

published --> archived
```

### 5.1 State Definitions

| State | Git State | Trigger |
|-------|-----------|---------|
| `draft` | Branch exists, not yet reviewed/merged | Content created or updated |
| `in_review` | PR/branch open, labeled `contentrain-content` | `contentrain_submit` in review mode |
| `published` | Content is on main branch | Auto-merge, or PR merged after review |
| `rejected` | PR closed without merge | Studio reviewer rejects changes |
| `archived` | Metadata-only state | Manual action -- content hidden but retained |

### 5.2 State Rules

- **State is tracked in `.contentrain/meta/`, NOT in content files.** Agents never read or write state directly.
- **auto-merge mode:** `draft` --> `published` (no `in_review` step).
- **review mode:** `draft` --> `in_review` --> `published` or `rejected`.
- **Git is the source of truth.** States are derived from Git state (branch existence, merge status, PR status).
- Rejected content includes reviewer feedback. The agent can address feedback and resubmit.

---

## 6. Validation Rules

### 6.1 When to Validate

- ALWAYS call `contentrain_validate` before `contentrain_submit`.
- `contentrain_submit` will fail if validation errors exist.
- Run validation after completing all changes in a batch, not after every individual save.

### 6.2 What Validation Checks

| Check | Severity | Description |
|-------|----------|-------------|
| Schema compliance | Error | Field values match their type definitions |
| Required fields | Error | All `required: true` fields have values |
| Unique constraints | Error | `unique: true` fields have no duplicates within the model |
| Locale completeness | Error/Warning | All supported locales have corresponding files and entries |
| Referential integrity | Error | Relation targets (IDs/slugs) exist in the target model |
| Canonical format | Warning | Files follow canonical serialization rules |
| Vocabulary usage | Warning | Content uses vocabulary terms when available |

### 6.3 Handling Validation Results

- **Errors:** MUST be fixed before submitting. Fix the content and re-validate.
- **Warnings:** Acceptable but should be addressed when possible. Acknowledge them before submitting.
- If validation returns zero errors, proceed with `contentrain_submit`.

---

## 7. Submit Behavior

### 7.1 auto-merge Mode

```
contentrain_submit
  --> Merge branch to main
  --> Update context.json
  --> Clean up worktree
  --> Status: published
```

### 7.2 review Mode

```
contentrain_submit
  --> Push branch to remote
  --> Update context.json
  --> Clean up worktree
  --> Status: in_review
  --> Studio notifies reviewers
```

### 7.3 Submit Rules

- Submit operates on the current pending branch. There must be pending changes.
- If no changes are pending, submit is a no-op.
- After submit, the agent can continue with other operations (new branch will be created for new changes).
- Normalize operations ALWAYS submit in review mode, regardless of project workflow setting.

---

## 8. Metadata Structure

Metadata files track governance information. They are system-managed -- agents NEVER write to them.

### File Paths

| Kind | Path |
|------|------|
| Singleton / Dictionary | `.contentrain/meta/{modelId}/{locale}.json` |
| Collection | `.contentrain/meta/{modelId}/{locale}.json` (object-map: `{ entryId: meta }`) |
| Document | `.contentrain/meta/{modelId}/{slug}/{locale}.json` |

### Metadata Fields

```json
{
  "status": "published",
  "source": "agent",
  "updated_by": "claude",
  "approved_by": "ahmet@contentrain.io",
  "version": "1"
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `status` | `draft`, `in_review`, `published`, `rejected`, `archived` | Current workflow state |
| `source` | `agent`, `human`, `import` | How the content was created |
| `updated_by` | string | Agent name or user email |
| `approved_by` | string or null | Who approved (review mode only) |
| `version` | string | Content version identifier |
