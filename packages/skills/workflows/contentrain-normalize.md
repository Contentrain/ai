# Skill: Extract Hardcoded Content Strings (Two-Phase Normalize)

> Scan the project for hardcoded user-visible strings, extract them into Contentrain models, and then patch source files to reference the extracted content.

---

## When to Use

The user wants to extract hardcoded strings from their codebase, or says something like "normalize my project", "extract content", "move strings to contentrain", "find hardcoded text", "internationalize", "add i18n".

This is a two-phase process:
- **Phase 1 (Extraction):** Pull hardcoded strings into `.contentrain/content/` — source files are NOT modified.
- **Phase 2 (Reuse):** Replace hardcoded strings in source files with i18n/content references.

Phase 1 is valuable on its own — extracted content can be managed in Studio, translated, and published without touching source code.

---

## Phase 1: Extraction

Extract content from source code into `.contentrain/` without modifying source files.

### Step 1. Check Project State

Call `contentrain_status` to confirm:

- The project is initialized (if not, run the `contentrain-init` skill first).
- Note supported locales and configured domains.
- Check for pending changes — resolve them before starting.

### Step 2. Build the Project Graph

Call `contentrain_scan(mode: "graph")` to build the import/component dependency graph.

Use this graph to:

- Understand which components belong to which pages or features.
- Identify shared components vs page-specific components.
- Prioritize files by their role in the project (layout, page, component).

### Step 3. Find Candidates

Call `contentrain_scan(mode: "candidates")` iteratively to find hardcoded strings.

The scan returns candidates with file paths, line numbers, string values, and surrounding context. Review candidates by file — not all strings should be extracted.

### Step 4. Evaluate Candidates

This is the intelligence step — you (the agent) make all the decisions:

- **Filter false positives:** Remove CSS values, technical identifiers, import paths, variable names, config values, log messages, and test strings. Refer to `normalize-rules.md` Section 5 for the full heuristics.
- **Assign domains:** Group candidates by domain (e.g., `marketing`, `blog`, `ui`, `system`).
- **Determine model types:** Decide the appropriate model kind for each group:
  - UI labels and error messages → `dictionary`
  - Page-specific content (hero, features) → `singleton`
  - Repeating items (testimonials, FAQs) → `collection`
  - Long-form content with metadata → `document`
- **Structure fields:** Define field names and assign candidate strings to fields.

### Step 5. Write Normalize Plan

After evaluating candidates, write the plan as `.contentrain/normalize-plan.json`:

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
      "fields": { "title": { "type": "string", "required": true }, "subtitle": { "type": "string" } }
    }
  ],
  "extractions": [
    { "value": "Build faster apps", "file": "src/pages/index.vue", "line": 12, "model": "hero-section", "field": "title" }
  ],
  "patches": [
    { "file": "src/pages/index.vue", "line": 12, "old_value": "Build faster apps", "new_expression": "{{ $t('hero.title') }}" }
  ]
}
```

This file is watched by the serve UI — writing it triggers automatic detection.

### Step 6. Open UI for Review

Start the review UI and direct the developer to visually inspect the plan:

1. **Start serve** (if not already running):

```bash
contentrain serve
```

2. **Direct the user** to the normalize page:

> "I've prepared a normalize plan with **{N} extractions** across **{M} models**.
> Review it visually at **http://localhost:3333/normalize** — you can inspect each extraction, see source traces, and preview patches.
> **Approve** or **Reject** directly from the UI."

3. **Wait for user action.** The UI provides:
   - Extraction review panel — grouped by model with field mappings
   - Source trace panel — click any extraction to see its original location
   - Patch preview panel — see exact source file changes
   - **Approve & Apply** button — executes the extraction
   - **Reject** button — deletes the plan

Do NOT proceed to apply unless the user approves (either via UI or explicit confirmation in chat).

**Alternative (no UI):** If the user prefers terminal-only workflow, present the summary inline and wait for explicit confirmation before proceeding. Skip to Step 7.

### Step 7. Preview Extraction (if not using UI)

Call `contentrain_apply(mode: "extract", dry_run: true)` to generate a preview.

Review the dry-run output:

- Verify model definitions are correct.
- Verify content assignments are accurate.
- Check for any missed candidates or misclassifications.

Show the preview to the user.

### Step 8. Execute Extraction

After user approval (via UI or chat), call `contentrain_apply(mode: "extract", dry_run: false)`.

Note: `dry_run` defaults to `true`, so you MUST explicitly set `dry_run: false` to execute.

This creates model definitions and content files in `.contentrain/` on a `contentrain/normalize/extract/{timestamp}` branch. Source files are NOT modified.

If approved via UI, the UI calls this automatically — no additional agent action needed.

### Step 9. Validate and Submit

Call `contentrain_validate` to check the extracted content:

- Schema compliance for all new models and entries.
- i18n completeness — source locale has all keys.
- No duplicate entries.
- Vocabulary alignment.

Call `contentrain_submit` to push the branch for review.

Normalize operations always use `review` workflow mode — changes are never auto-merged.

Tell the user: "Phase 1 complete. Content is now in Contentrain and can be managed, translated, and published from Studio. When ready, proceed with Phase 2 to update source files."

---

## Phase 2: Reuse

Patch source files to replace hardcoded strings with content references. Only start after Phase 1 is reviewed and merged.

### Step 1. Select Scope

List the extracted models and ask the user which model or domain to process first.

Process one model or domain at a time to keep diffs small and reviewable.

### Step 2. Determine Replacement Expressions

Based on the project's tech stack, determine the correct replacement pattern:

| Stack | Pattern | Example |
|---|---|---|
| Vue/Nuxt (vue-i18n) | `{{ $t('key') }}` | `{{ $t('hero.title') }}` |
| React/Next (next-intl) | `{t('key')}` | `{t('hero.title')}` |
| React/Next (react-intl) | `{intl.formatMessage({id: 'key'})}` | `{intl.formatMessage({id: 'hero.title'})}` |
| Svelte/SvelteKit | `{$t('key')}` | `{$t('hero.title')}` |
| Astro | `{t('key')}` | `{t('key')}` |
| SDK direct import | `query('model').all()` | Direct data access via `#contentrain` |

Also determine any necessary import statements that must be added to patched files (e.g., `import { useTranslation } from 'next-intl'`).

The agent determines the replacement expression — MCP does exact string replacement only.

### Step 3. Preview Reuse

Call `contentrain_apply(mode: "reuse", scope: { model: "<model-id>" }, patches: [...], dry_run: true)`.

The `scope` requires at least one of `model` or `domain`. The `patches` array contains the replacement instructions:

Review the dry-run output:

- Verify each string replacement is correct.
- Verify import statements will be added where needed.
- Confirm no non-content strings are being replaced.
- Check that component structure and behavior are preserved.

Show the preview to the user.

### Step 4. Execute Reuse

After user confirmation, call `contentrain_apply(mode: "reuse", scope: { model: "<model-id>" }, patches: [...], dry_run: false)`.

Note: `dry_run` defaults to `true`, so you MUST explicitly set `dry_run: false` to execute.

This patches source files and creates a `contentrain/normalize/reuse/{model}/{timestamp}` branch.

### Step 5. Validate and Submit

Call `contentrain_validate` to verify:

- Source files parse correctly after patching.
- Content references resolve to existing entries.
- No strings were missed or double-replaced.

Call `contentrain_submit` to push the branch for review.

### Step 6. Repeat

Ask the user which model or domain to process next. Repeat steps 1-5 for each remaining model until all extracted content is referenced in source code.

---

## Important Rules

- **ALWAYS dry-run before apply.** Both extract and reuse require a preview step.
- **Normalize branches always use `review` mode.** Never auto-merge.
- **Phase 2 requires Phase 1 to be merged.** Content must exist in `.contentrain/` before patching source.
- **Process reuse one model at a time.** Keep diffs small and reviewable.
- **MCP is framework-agnostic.** You (the agent) provide all stack-specific replacement expressions.
- **Do not change component structure.** Only replace string literals with content references.
