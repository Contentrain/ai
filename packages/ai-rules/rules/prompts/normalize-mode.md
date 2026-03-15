# Normalize Mode — Extract Hardcoded Strings from Source Code

> **Prerequisites:** Read `prompts/common.md` first. All shared rules apply. Read `rules/shared/normalize-rules.md` for the full guardrail reference.

This mode converts a codebase with hardcoded strings into a Contentrain-managed content architecture. It has two independent phases, each producing a separate branch for review.

---

## Architecture Overview

| Aspect | Phase 1: Extraction | Phase 2: Reuse |
|--------|---------------------|----------------|
| Purpose | Pull content from source code into `.contentrain/` | Patch source files to reference extracted content |
| Source files modified | No | Yes |
| Branch pattern | `contentrain/normalize/extract/{domain}/{timestamp}` | `contentrain/normalize/reuse/{model}/{locale}/{timestamp}` |
| Prerequisite | Initialized `.contentrain/` | Completed extraction (content exists) |
| Workflow mode | Always `review` | Always `review` |
| Standalone value | Yes — content is manageable in Studio immediately | Depends on Phase 1 |

**Why two phases?** Phase 1 alone is valuable: content is extracted, Studio can manage it, new locales can be added. Phase 2 can be done incrementally, model by model, reducing risk. Separate reviews mean clearer diffs and easier rollback.

---

## Responsibility Split

### You (the Agent) Decide:

- What is content vs code — this is a semantic judgment requiring context understanding
- Domain assignment — which domain each piece of content belongs to
- Model structure — how to group related content, which kind to use
- Replacement expressions — stack-specific syntax (see Phase 2)
- False positive filtering — removing non-content strings from candidates

### MCP Tools Handle:

- File system scanning (graph building, candidate finding)
- Reading and writing files in `.contentrain/`
- Patching source files with exact string replacements
- Branch creation, commits, validation, submit
- Guardrail enforcement (file limits, dry-run requirement)

---

## Phase 1: Extraction

### Step 1 — Initialize and Scan Structure

If `.contentrain/` does not exist, initialize first:
```
contentrain_init(stack: "{stack}", locales: ["{default_locale}", ...])
```

Build the project graph to understand architecture:
```
contentrain_scan(mode: "graph")
```

The graph output shows import/component dependency relationships. Use it to:
- Identify page components vs shared components
- Understand which files contain user-facing content
- Prioritize high-impact files (layouts, pages) over low-impact files (utilities, configs)

### Step 2 — Scan Candidates

Find hardcoded string candidates:
```
contentrain_scan(mode: "candidates")
```

This returns candidate strings with file locations, line numbers, and surrounding code context. Maximum 500 files per scan.

### Step 3 — Agent Evaluation (Your Job)

This is the critical intelligence step. For each candidate string, determine:

**Is this content?** Apply these heuristics:

Extract these (user-visible text):
- Headings and titles in templates/JSX (`<h1>`, `<h2>`, etc.)
- Paragraph text and body copy
- Button labels (`<button>Submit</button>`)
- Link text (`<a>Learn more</a>`)
- Form labels and placeholders (`<label>`, `placeholder="..."`)
- Error messages and success/notification messages
- Alt text (`alt="..."`) and ARIA labels (`aria-label="..."`)
- Meta descriptions and page titles
- Navigation items, tooltip text, empty state messages
- CTA (call-to-action) text

Do NOT extract these (code artifacts):
- CSS class names, HTML IDs
- Variable names, function names, parameter names
- Technical identifiers (API endpoints, route paths, event names)
- Import paths and file paths
- Numbers used as constants (ports, HTTP status codes, pixel values, timeouts)
- Strings shorter than 3 characters (unless semantically meaningful: "OK", "No", "Yes")
- Regular expressions, configuration values, log messages
- Code comments, test assertion strings, JSON keys
- Enum values used as code identifiers (not displayed to users)

**Domain assignment:** Group each content string into a domain:

| Content Location | Suggested Domain |
|------------------|-----------------|
| Landing page, marketing sections | `marketing` |
| Blog, articles, posts | `blog` |
| Navigation, footer, header | `ui` |
| Error messages, validation | `system` |
| Product pages, e-commerce | `product` |
| Documentation, help | `docs` |
| User-facing app strings | `app` |

**Model structure:** Group related candidates into models. Choose the right kind:

| Content Pattern | Kind |
|----------------|------|
| One set of fields per page section | `singleton` |
| Multiple items of same type | `collection` |
| Long-form with metadata | `document` |
| Key-value UI strings | `dictionary` |

**Field assignment:** For each candidate, determine:
- Which model it belongs to
- Which field name to assign (use snake_case, descriptive names)
- For dictionaries: which dot-notation key to assign

### Step 4 — Preview Extraction

Always dry-run before executing:
```
contentrain_apply(mode: "extract", dry_run: true)
```

Review the dry-run output carefully:
- Are models structured correctly?
- Are content assignments accurate?
- Are there missing or misclassified candidates?
- Are field names descriptive and consistent?

### Step 5 — Execute Extraction

After confirming the dry-run output:
```
contentrain_apply(mode: "extract")
```

This creates model definitions and content files in `.contentrain/`. Source files are NOT modified.

### Step 6 — Validate and Submit

```
contentrain_validate
contentrain_submit
```

Submit always uses `review` mode for normalize operations. The extraction branch is pushed for team review.

### Extraction Rules

- Extraction creates content in `.contentrain/` but does NOT modify source files
- Each extraction produces a single branch with all extracted content
- Group related content into the fewest models that make semantic sense
- Prefer `dictionary` kind for UI labels and error messages
- Prefer `singleton` kind for page-specific content (hero, features)
- Prefer `collection` kind for repeating items (team members, FAQs, testimonials)
- Maximum 100 files per apply operation

---

## Phase 2: Reuse

> **Prerequisite:** Phase 1 extraction must be complete and merged. Content must exist in `.contentrain/` before patching source files.

### Step 1 — Select Scope

Choose one model or one domain to process. Do NOT reuse the entire project in one operation.

```
Example scopes: "marketing-hero", "error-messages", "marketing" (domain-level)
```

### Step 2 — Determine Replacement Expressions

This is YOUR job. Based on the project's tech stack (`{stack}`), determine the replacement syntax. MCP is framework-agnostic — it does not know how replacement expressions work.

#### Nuxt / Vue

```vue
<!-- Template context -->
{{ $t('hero.title') }}
{{ $t('hero.description') }}

<!-- Script context -->
const { t } = useI18n()
t('hero.title')

<!-- Attribute binding -->
:placeholder="$t('form.email_placeholder')"
:alt="$t('hero.image_alt')"
```

i18n library: `@nuxtjs/i18n` (Nuxt) or `vue-i18n` (Vue)

#### Next.js / React

```jsx
// With next-intl
import { useTranslations } from 'next-intl'
const t = useTranslations('hero')
<h1>{t('title')}</h1>
<p>{t('description')}</p>

// With react-intl
import { useIntl } from 'react-intl'
const intl = useIntl()
<h1>{intl.formatMessage({ id: 'hero.title' })}</h1>

// Attribute context
<input placeholder={t('form.email_placeholder')} />
<img alt={t('hero.image_alt')} />
```

i18n library: `next-intl` or `react-intl`

#### Astro

```astro
---
import { getRelativeLocaleUrl } from 'astro:i18n'
import { t } from '@utils/i18n'
---
<h1>{t('hero.title')}</h1>
<p>{t('hero.description')}</p>
<img alt={t('hero.image_alt')} />
```

i18n library: `astro:i18n` (built-in)

#### SvelteKit / Svelte

```svelte
<script>
  import { t } from 'sveltekit-i18n'
</script>

<h1>{$t('hero.title')}</h1>
<p>{$t('hero.description')}</p>
<img alt={$t('hero.image_alt')} />
```

i18n library: `sveltekit-i18n` or `svelte-i18n`

#### SDK Direct Import (No i18n)

For projects that consume content directly without i18n:

```ts
import { query } from '#contentrain'
const hero = singleton('marketing-hero').locale('en').get()
```

### Step 3 — Preview Reuse

Always dry-run before executing:
```
contentrain_apply(mode: "reuse", scope: "model-id", dry_run: true)
```

Review the dry-run output:
- Is each string replacement correct?
- Will necessary import statements be added?
- Are non-content strings left untouched?
- Is the i18n setup code included where needed (composable import, hook call)?

### Step 4 — Execute Reuse

After confirming the dry-run output:
```
contentrain_apply(mode: "reuse", scope: "model-id")
```

This patches source files with content references. Each reuse operation creates a separate branch.

### Step 5 — Validate and Submit

```
contentrain_validate
contentrain_submit
```

### Step 6 — Repeat

Repeat Steps 1-5 for each model or domain until all extracted content is referenced in source files.

### Reuse Rules

- Process one model or domain at a time. No whole-project reuse in one operation.
- Ensure the i18n/content library is properly configured in the project before reuse.
- Add necessary imports to patched files (e.g., `import { useTranslations } from 'next-intl'`).
- Do NOT change the structure or behavior of components — only replace string literals with content references.
- If a source file requires setup code (composable import, hook call), include it in the patch.
- Maximum 100 files per apply operation.

---

## Guardrails Summary

| Guardrail | Limit |
|-----------|-------|
| Allowed source file types | `.vue`, `.tsx`, `.jsx`, `.ts`, `.js`, `.mjs`, `.astro`, `.svelte` |
| Max files per scan | 500 |
| Max files per apply | 100 |
| Dry-run before apply | MANDATORY |
| Workflow mode | Always `review` |
| Reuse scope | Per model or per domain |
| Reuse prerequisite | Extraction must be complete |

Attempting to apply without a prior dry-run will be rejected. Attempting to reuse without completed extraction will be rejected. Exceeding file limits will truncate results with a warning.

---

## Common Mistakes to Avoid

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

---

## Checklist — Phase 1 (Extraction)

- [ ] Project graph analyzed to understand architecture
- [ ] All candidates evaluated: content vs code distinction applied
- [ ] False positives filtered out
- [ ] Candidates grouped into models with correct kinds
- [ ] Domains assigned logically
- [ ] Dry-run reviewed and confirmed
- [ ] Extraction executed successfully
- [ ] `contentrain_validate` returns zero errors
- [ ] Branch submitted for review

## Checklist — Phase 2 (Reuse)

- [ ] Phase 1 extraction is merged
- [ ] i18n library is configured in the project
- [ ] Replacement expressions match the project stack
- [ ] Scope is limited to one model or domain
- [ ] Dry-run reviewed and confirmed
- [ ] Reuse executed successfully
- [ ] Import statements added to patched files
- [ ] Component structure and behavior unchanged
- [ ] `contentrain_validate` returns zero errors
- [ ] Branch submitted for review
