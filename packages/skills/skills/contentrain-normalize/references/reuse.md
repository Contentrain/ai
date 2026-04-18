---
name: reuse
description: "Phase 2 reuse details, replacement expressions by stack, and patching rules"
---

# Phase 2: Reuse Details

Reuse patches source files to replace hardcoded strings with content references. Only start after Phase 1 (extraction) is reviewed and merged. Content must exist in `.contentrain/` before patching source files.

---

## Reuse Flow

### 1. Select Scope

List the extracted models and ask the user which model or domain to process first. Process one model or domain at a time to keep diffs small and reviewable.

### 2. Determine Replacement Expressions

Based on the project's tech stack, determine how source files should reference content. The agent determines the replacement expression -- MCP does exact string replacement only.

Also determine any necessary import statements that must be added to patched files (e.g., `import { useTranslation } from 'next-intl'`).

### 3. Preview Reuse

```
contentrain_apply(mode: "reuse", scope: { model: "<model-id>" }, patches: [...], dry_run: true)
```

The `scope` requires at least one of `model` or `domain`. The `patches` array contains the replacement instructions.

Review the dry-run output:

- Verify each string replacement is correct.
- Verify import statements will be added where needed.
- Confirm no non-content strings are being replaced.
- Check that component structure and behavior are preserved.

### 4. Execute Reuse

```
contentrain_apply(mode: "reuse", scope: { model: "<model-id>" }, patches: [...], dry_run: false)
```

`dry_run` defaults to `true`, so you MUST explicitly set `dry_run: false` to execute. This patches source files and creates a `cr/normalize/reuse/{model}/{timestamp}` branch.

### 5. Validate and Submit

```
contentrain_validate
contentrain_submit
```

Verify source files parse correctly after patching, content references resolve to existing entries, and no strings were missed or double-replaced.

### 6. Repeat

Repeat steps 1-5 for each remaining model or domain until all extracted content is referenced in source code.

---

## Replacement Expressions by Stack

| Stack | Template Pattern | Attribute Pattern | Script Pattern | Example |
|-------|-----------------|-------------------|----------------|---------|
| Vue/Nuxt (vue-i18n) | `{{ $t('key') }}` | `:attr="$t('key')"` | `t('key')` | `{{ $t('hero.title') }}` |
| React/Next (next-intl) | `{t('key')}` | `{t('key')}` | `t('key')` | `{t('hero.title')}` |
| React/Next (react-intl) | `{intl.formatMessage({id: 'key'})}` | `{intl.formatMessage({id: 'key'})}` | `intl.formatMessage({id: 'key'})` | `{intl.formatMessage({id: 'hero.title'})}` |
| Svelte/SvelteKit | `{$t('key')}` | `{$t('key')}` | `$t('key')` | `{$t('hero.title')}` |
| Astro | `{t('key')}` | `{t('key')}` | `t('key')` | `{t('hero.title')}` |
| SDK direct import | `{data.field}` | `{data.field}` | `query('model').first()` | Direct data access via `#contentrain` |

### Import Statements by Stack

When patching files, ensure the necessary imports or setup code are added:

| Stack | Required Import/Setup |
|-------|----------------------|
| Vue/Nuxt (vue-i18n) | `const { t } = useI18n()` in `<script setup>` |
| React/Next (next-intl) | `import { useTranslations } from 'next-intl'` + `const t = useTranslations()` |
| React/Next (react-intl) | `import { useIntl } from 'react-intl'` + `const intl = useIntl()` |
| Svelte/SvelteKit | `import { t } from '$lib/i18n'` (project-specific) |
| Astro | `import { t } from '@/i18n'` (project-specific) |
| SDK direct import | `import { query } from '#contentrain'` |

Detect the project's existing i18n setup and match its import conventions. Do not introduce new i18n libraries.

---

## Reuse Rules

1. **One model at a time.** Do NOT reuse the entire project in one operation. Keep diffs small and reviewable.

2. **Ensure i18n is configured.** The i18n/content library must be properly configured in the project before reuse. Check for existing i18n setup.

3. **Add necessary imports.** Every patched file must have the required import statements and setup code (composable import, hook call, etc.).

4. **Do NOT change component structure.** Only replace string literals with content references. Do not modify component behavior, layout, or logic.

5. **Include setup code.** If a source file requires setup code (composable import, hook call), include it in the patch.

6. **Handle attribute bindings.** When replacing strings in HTML attributes (e.g., `placeholder="Search"`), use the correct attribute binding syntax for the stack (e.g., `:placeholder="$t('search')"` in Vue).

7. **Preserve surrounding markup.** Do not add or remove HTML tags, change class names, or alter component props beyond the string replacement.

---

## Reuse Patch Example

```json
{
  "mode": "reuse",
  "scope": { "model": "ui-texts" },
  "dry_run": false,
  "patches": [
    {
      "file": "src/components/Header.vue",
      "line": 15,
      "old_value": "Sign in",
      "new_expression": "{{ $t('ui.sign-in') }}"
    },
    {
      "file": "src/components/Header.vue",
      "line": 22,
      "old_value": "Sign up",
      "new_expression": "{{ $t('ui.sign-up') }}"
    }
  ],
  "imports": [
    {
      "file": "src/components/Header.vue",
      "statement": "const { t } = useI18n()",
      "location": "script-setup"
    }
  ]
}
```

---

## Edge Cases

- **Strings in script blocks:** Use the script pattern (no template delimiters). Example: `const label = t('key')` not `const label = {{ $t('key') }}`.
- **Strings in computed properties:** Wrap in the computed function body using the script pattern.
- **Conditional content:** If a string appears inside a ternary or conditional, replace only the string literal, not the condition.
- **Multi-line strings:** Replace the entire multi-line string as one unit. Do not split across multiple patches.
