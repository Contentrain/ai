# Skill: Review Pending Content Changes

> Review content changes on Contentrain branches, apply quality checks, and recommend approval or rejection.

---

## When to Use

The user wants to review content quality, audit existing entries, check pending changes, or run a pre-publish checklist. Triggers: "review content", "check pending changes", "review the contentrain branch", "content QA", "audit content", "pre-publish check".

---

## Steps

### 1. Check Project State

Call `contentrain_status` to understand the current project:

- All models, their kinds, domains, and entry counts.
- Configured locales and source locale.
- Pending branches or unsubmitted changes.
- Workflow mode (auto-merge or review).

### 2. List Content for Review

For each model (or the user-specified scope), call `contentrain_content_list(model: "<modelId>", locale: "<locale>")`:

- Retrieve entries for the source locale first.
- For i18n models, also retrieve entries for each target locale.
- Note entry counts per locale to identify i18n coverage gaps.

If reviewing a specific branch, list the `contentrain/*` branches and show:

- Branch name (indicates operation type: extract, reuse, content-save, model-save).
- Number of changed files.
- Last commit date.

### 3. Run Automated Validation

Call `contentrain_validate` to get the automated validation report:

- Schema compliance errors (missing required fields, type mismatches).
- Referential integrity issues (broken relation references).
- i18n completeness gaps (missing locale entries).
- Content policy violations.

### 4. Apply Quality Checklist

Go through each category and report findings:

#### 4.1 Content Quality (from content-quality.md)

- [ ] All required fields are populated with real, non-placeholder values.
- [ ] Text fields respect `min`/`max` constraints.
- [ ] No placeholder text (lorem ipsum, TODO, TBD, [insert here]).
- [ ] Tone is consistent with `context.json` → `conventions.tone`.
- [ ] Vocabulary terms from `vocabulary.json` are used consistently.
- [ ] Collection entries have no duplicate `unique` field values.
- [ ] Content follows the correct content type pattern (blog post, landing page, docs, etc.).
- [ ] No duplicate content across entries.

#### 4.2 SEO (from seo-rules.md)

- [ ] Page titles: 50-60 characters (max 70), primary keyword in first 30 characters.
- [ ] Meta descriptions: 120-160 characters, complete sentences.
- [ ] Slugs: kebab-case, descriptive, 3-5 words, no stop words.
- [ ] Heading hierarchy in markdown/richtext: h1 → h2 → h3 (no skips).
- [ ] Image alt text is present and descriptive (under 125 characters).
- [ ] No orphan pages (content exists but is not linked/referenced).

#### 4.3 Accessibility (from accessibility-rules.md)

- [ ] Image fields have corresponding alt text fields (or the alt is embedded).
- [ ] Color contrast: text color values meet WCAG AA ratio if paired colors are in the model.
- [ ] Link text is descriptive (no raw URLs, "click here", or "read more" without context).
- [ ] Media content has text alternatives where applicable.
- [ ] Heading hierarchy is sequential (no skipped levels).
- [ ] Color is not used as the sole means of conveying information.

#### 4.4 Security (from security-rules.md)

- [ ] No hardcoded secrets, API keys, or credentials in content fields.
- [ ] No internal URLs or staging domains in production content.
- [ ] User-generated or external URLs use HTTPS.
- [ ] No inline JavaScript or script injection vectors in richtext/markdown fields.
- [ ] No user-supplied HTML that could enable XSS.
- [ ] Email fields contain valid, non-internal addresses (unless intended).

#### 4.5 i18n Completeness (from i18n-quality.md)

- [ ] All models with `i18n: true` have entries for every supported locale.
- [ ] Entry counts match across locales (no missing translations).
- [ ] Required fields are populated in every locale.
- [ ] Dictionary keys are identical across all locale files.
- [ ] Vocabulary terms are translated in all locales.
- [ ] Translations are idiomatic (not word-for-word).
- [ ] Translated text fits within field `max` constraints.
- [ ] No source-locale text left untranslated in target locales.

#### 4.6 Referential Integrity

- [ ] All `relation` fields point to existing entries.
- [ ] All `relations` arrays contain valid references.
- [ ] No circular relations that could cause infinite loops.
- [ ] Referenced entries are in a publishable state.

### 5. Generate Review Report

Present a structured report:

```
## Content Review Report

### Summary
- Models reviewed: X
- Total entries: X
- Locales checked: X

### Issues Found

#### Critical (must fix before publish)
- [list of blocking issues with field references]

#### Warning (should fix)
- [list of non-blocking issues]

#### Info (suggestions)
- [list of improvements]

### Per-Model Breakdown
| Model | Kind | Entries | Issues | Status |
|---|---|---|---|---|

### i18n Coverage
| Locale | Coverage | Missing Entries |
|---|---|---|
```

### 6. Make a Recommendation

Based on the findings:

- **Approve:** No errors, few or no warnings. Changes are ready to merge.
- **Request changes:** Errors or significant warnings found. List the specific changes needed.
- **Reject:** Fundamental issues (wrong model structure, placeholder-only content, security violations). Explain why and suggest starting over.

### 7. Offer Fixes

For each fixable issue, offer to resolve it:

- Missing translations: offer to run `/contentrain-translate`.
- Schema violations: offer to update entries with `contentrain_content_save`.
- Missing required fields: draft content for empty fields.
- SEO issues: suggest improved titles, descriptions, slugs.

Only make changes after user approval.

### 8. Re-validate

If fixes were applied, call `contentrain_validate` again to confirm all issues are resolved.

Report the final status: "All checks passed" or list remaining issues that require manual attention.
