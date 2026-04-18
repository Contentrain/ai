---
name: contentrain-normalize
description: "Two-phase normalize flow: extract hardcoded strings from source code into .contentrain/ (Phase 1) and patch source files with content references (Phase 2). Use when normalizing, extracting content, or replacing hardcoded strings."
metadata:
  author: Contentrain
  version: "1.0.0"
---

# Contentrain Normalize

Normalize converts a codebase with hardcoded strings into a Contentrain-managed content architecture. It runs in two independent phases, each producing a separate branch for review.

- **Phase 1 (Extraction):** Pull content from source code into `.contentrain/` structure. Source files are NOT modified.
- **Phase 2 (Reuse):** Patch source files to replace hardcoded strings with content references. Requires completed extraction.

Phase 1 alone is valuable: content becomes manageable in Studio, translatable, and publishable without touching source code.

---

## MUST Rules

- MUST scan before extract (`contentrain_scan` → `contentrain_apply`)
- MUST `dry_run: true` before `dry_run: false` for every `contentrain_apply` call
- MUST merge Phase 1 branch before starting Phase 2
- MUST run `npx contentrain generate` after Phase 2 completes
- MUST NOT reuse without scoped model or domain (whole-project patching is blocked)
- MUST NOT patch `.contentrain/` files via reuse (content files are read-only for reuse)
- MUST NOT exceed 100 patches per `contentrain_apply` call

## Transport Requirements

Normalize (`contentrain_scan` and `contentrain_apply`) requires **local
disk access** — AST scanners walk the source tree and patch files in
place. It runs only on a `LocalProvider` (stdio transport, or an HTTP
transport configured with a `LocalProvider`).

Remote providers (`GitHubProvider`, `GitLabProvider`, future
`BitbucketProvider`) expose `astScan: false`, `sourceRead: false`, and
`sourceWrite: false`. Calling these tools over a remote provider
returns a uniform capability error:

```json
{
  "error": "contentrain_scan requires local filesystem access.",
  "capability_required": "astScan",
  "hint": "This tool is unavailable when MCP is driven by a remote provider. Use a LocalProvider or the stdio transport."
}
```

If the agent is driving a remote-only MCP session, normalize must run
in a separate local-checkout session before the extracted content
branch is pushed.

---

## Two-Phase Architecture

| Aspect | Phase 1: Extraction | Phase 2: Reuse |
|--------|-------------------|----------------|
| Purpose | Pull content from source to `.contentrain/` | Patch source files with content references |
| Scope | Full project scan | Per model or per domain |
| Source files modified | No | Yes |
| Branch pattern | `cr/normalize/extract/{domain}/{timestamp}` | `cr/normalize/reuse/{model}/{locale}/{timestamp}` |
| Prerequisite | Initialized `.contentrain/` | Completed extraction (content exists in `.contentrain/`) |
| Workflow mode | Always `review` | Always `review` |
| Standalone value | Yes -- content is manageable in Studio immediately | Depends on Phase 1 |

---

## Agent vs MCP Responsibilities

### Agent (Intelligence Layer)

- **Decide what is content vs code.** Semantic judgment requiring context understanding.
- **Assign domain grouping.** Determine which domain each piece of content belongs to.
- **Determine model structure.** Group related content into models, choose the right kind.
- **Create replacement expressions.** Stack-specific, requires framework knowledge (Vue/Nuxt, React/Next, Svelte, Astro, SDK).
- **Filter false positives** from scan candidates.
- **Evaluate and group** candidates into logical models.

### MCP (Deterministic Infrastructure)

- **Scan the file system** (build graph, find candidates).
- **Read and write files** in `.contentrain/`.
- **Patch source files** with exact string replacement (agent provides the replacement expression).
- **Create branches, commit, validate** all changes.
- **Enforce guardrails** (file limits, type restrictions, dry-run requirement).

MCP is framework-agnostic. It does NOT know how `{t('key')}` differs from `{{ $t('key') }}`. The agent provides all stack-specific logic.

---

## Guardrails

| Guardrail | Limit | Rationale |
|-----------|-------|-----------|
| Allowed source file types | `.vue`, `.tsx`, `.jsx`, `.ts`, `.js`, `.mjs`, `.astro`, `.svelte` | Only scan files that can contain UI content |
| Max files per scan | 500 | Prevent scanning entire monorepos |
| Max files per apply | 100 | Keep diffs reviewable |
| Dry-run before apply | **MANDATORY** | Preview all changes before executing |
| Workflow mode | Always `review` | Normalize changes are never auto-merged |
| Reuse scope | Per model or per domain | No whole-project reuse in one operation |
| Reuse prerequisite | Extraction must be complete | Content must exist in `.contentrain/` before patching source |

Attempting to apply without a prior dry-run will be rejected. Exceeding file limits will truncate results with a warning.

---

## Phase 1: Extraction (Step-by-Step)

### 1. Check Project State

Call `contentrain_status` to confirm the project is initialized and note supported locales. Call `contentrain_describe_format` to understand the four storage formats (dictionary, collection, singleton, document) before deciding model structure.

### 2. Build the Project Graph

Call `contentrain_scan(mode: "graph")` to build the import/component dependency graph. Use this to understand which components belong to which pages, identify shared vs page-specific components, and prioritize files.

### 3. Find Candidates

Call `contentrain_scan(mode: "candidates")` to find hardcoded strings. The scan returns candidates with file paths, line numbers, string values, and surrounding context.

### 4. Evaluate Candidates (Agent Intelligence)

- **Filter false positives:** Remove CSS values, technical identifiers, import paths, variable names, config values, log messages, test strings. See [What Is Content](references/what-is-content.md) for full heuristics.
- **Assign domains:** Group candidates by domain (e.g., `marketing`, `blog`, `ui`, `system`).
- **Determine model types:** Choose dictionary, singleton, collection, or document kind for each group.
- **Structure fields:** Define field names and assign candidate strings to fields.

### 5. Preview Extraction

Call `contentrain_apply(mode: "extract", dry_run: true)` to generate a preview. Review the dry-run output: verify model definitions, content assignments, and check for missed or misclassified candidates. Show the preview to the user.

### 6. Execute Extraction

After user approval, call `contentrain_apply(mode: "extract", dry_run: false)`. This creates model definitions and content files in `.contentrain/` on a `cr/normalize/extract/{timestamp}` branch. Source files are NOT modified.

### 7. Validate and Submit

Call `contentrain_validate` to check schema compliance, i18n completeness, and duplicate entries. Call `contentrain_submit` to push the branch for review. Normalize operations always use `review` workflow mode.

Tell the user: "Phase 1 complete. Content is now in Contentrain and can be managed, translated, and published from Studio. When ready, proceed with Phase 2 to update source files."

### Step 5: User Review

Two paths — agent chooses based on context:

**Path A — Browser Review (recommended for visual diff):**
1. Ensure `contentrain serve` is running (or ask user to start it)
2. Summarize the dry_run output to the user
3. Direct user to http://localhost:3333/normalize
4. Explain: "On this page you can review the extraction plan and Approve or Reject it."
5. Wait for user decision

**Path B — Terminal Review:**
1. Show dry_run output to user
2. Ask for explicit approval
3. If approved: `contentrain_apply(mode: 'extract', dry_run: false)` → execute
4. `contentrain_validate` → `contentrain_submit`
5. `contentrain_merge(branch: 'cr/normalize/extract/...', confirm: true)` to merge locally

### Step 6: Merge Phase 1 Branch

Phase 2 CANNOT start until Phase 1 branch is merged. Three options:
- **Browser:** localhost:3333/branches → click Merge
- **MCP Tool:** `contentrain_merge(branch: 'cr/normalize/extract/...', confirm: true)`
- **Git platform:** Create PR → review → merge

Verify with `contentrain_status` — check that extract branch is no longer in unmerged list.

### Step 7: Phase 2 Prerequisite Check

Before starting reuse:
1. Call `contentrain_status` and verify extract branch is merged
2. If not merged → inform user and wait
3. If merged → proceed to Phase 2 reuse

### Step 8: SDK Regeneration (after Phase 2)

After all reuse operations are complete, source files now use `#contentrain` imports.
The SDK client MUST be regenerated:

```bash
npx contentrain generate
```

Without this, `#contentrain` imports will fail at build time.
See: **contentrain-generate** skill for details.

---

## Phase 2: Reuse (Step-by-Step)

Only start after Phase 1 is reviewed and merged.

### 1. Select Scope

List the extracted models and ask the user which model or domain to process first. Process one model or domain at a time to keep diffs small and reviewable.

### 2. Determine Replacement Expressions (Agent Intelligence)

Based on the project's tech stack, determine the correct replacement pattern. See [Reuse Details](references/reuse.md) for the full replacement expressions table by stack. Also determine any necessary import statements for patched files.

### 3. Preview Reuse

Call `contentrain_apply(mode: "reuse", scope: { model: "<model-id>" }, patches: [...], dry_run: true)`. Review: verify each replacement is correct, import statements will be added, no non-content strings are being replaced, component structure is preserved.

### 4. Execute Reuse

After user confirmation, call `contentrain_apply(mode: "reuse", scope: { model: "<model-id>" }, patches: [...], dry_run: false)`. This patches source files and creates a `cr/normalize/reuse/{model}/{timestamp}` branch.

### 5. Validate and Submit

Call `contentrain_validate` to verify source files parse correctly, content references resolve, and no strings were missed or double-replaced. Call `contentrain_submit` to push the branch for review.

### 6. Repeat

Ask the user which model or domain to process next. Repeat steps 1-5 for each remaining model until all extracted content is referenced in source code.

---

## Domain and Model Grouping Guidelines

### Domain Assignment

| Content Location | Suggested Domain |
|------------------|-----------------|
| Landing page, marketing sections | `marketing` |
| Blog, articles, posts | `blog` |
| Navigation, footer, header | `ui` |
| Error messages, validation | `system` |
| Product pages, e-commerce | `product` |
| Documentation, help | `docs` |
| User-facing app strings | `app` |

### Model Kind Selection

| Content Pattern | Kind | Rationale |
|----------------|------|-----------|
| One set of fields per page section | `singleton` | Hero, features, pricing header |
| Multiple items of same type | `collection` | Team members, FAQs, testimonials |
| Long-form with metadata | `document` | Blog posts, documentation pages |
| Key-value UI strings | `dictionary` | Error messages, button labels, form labels |

---

## Common Mistakes

| Mistake | Correct Approach |
|---------|-----------------|
| Extracting CSS values as content | Only extract user-visible text |
| Creating one model per component | Group related content into shared models |
| Skipping dry-run | ALWAYS preview before apply |
| Auto-merging normalize changes | Normalize ALWAYS uses review mode |
| Reusing before extraction is merged | Wait for extraction review and merge first |
| Processing all models in one reuse | Scope reuse to one model/domain at a time |
| Ignoring project graph | Use graph output to understand component relationships |
| Hardcoding replacement patterns | Detect the project's i18n stack and use its conventions |
| Extracting strings with runtime variables | Split parameterized strings: extract the static part, leave interpolation in code |

---

## References

- [Extraction Details](references/extraction.md) -- Phase 1 extraction rules, parameters, and examples
- [Reuse Details](references/reuse.md) -- Phase 2 replacement expressions by stack and patching rules
- [What Is Content](references/what-is-content.md) -- Heuristics for identifying content vs code strings

## Related Skills

- **contentrain-serve** — Browser-based review UI for extraction approval
- **contentrain-generate** — SDK client regeneration (required after reuse)
- **contentrain-sdk** — @contentrain/query usage in source code
- **contentrain** — Core architecture and full MCP tool catalog
