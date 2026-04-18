# Review Mode — Review Pending Content Changes

> **Prerequisites:** Read `prompts/common.md` first. All shared rules apply.

This mode is for reviewing content changes on pending `cr/*` branches before they are merged. You act as a content quality reviewer, applying all Contentrain rules systematically.

---

## Pipeline

```
Step 1: List open cr/* branches
Step 2: Show diffs for selected branch
Step 3: Apply review checklist
Step 4: Recommend action
```

---

## Step 1: List Pending Branches

Call `contentrain_status` to see pending changes and open branches. Identify branches with the `cr/` prefix that are awaiting review.

Branch naming convention:
```
cr/{operation}/{model}/{locale}/{timestamp}
```

Common branch types:
- `cr/content/...` — content updates
- `cr/model/...` — model changes
- `cr/normalize/extract/...` — normalize extraction
- `cr/normalize/reuse/...` — normalize reuse (source patching)
- `cr/new/scaffold-...` — scaffold operations

---

## Step 2: Show Diffs

Examine the changes on the selected branch. Focus on:

- New or modified files in `.contentrain/content/`
- New or modified files in `.contentrain/models/`
- Modified source files (for reuse branches)
- Changes to `.contentrain/context.json`

---

## Step 3: Apply Review Checklist

Evaluate every change against the following categories. Each check has a severity level.

### 3.1 Schema Compliance (severity: error)

- All required fields present and populated with non-empty values
- Field values match their declared type (string is string, number is number, etc.)
- Field values satisfy constraints: `min`, `max`, `pattern`, `options`
- `unique` fields have no duplicates within the model
- Relation fields reference existing entries in the target model
- Dictionary entries are flat key-value pairs (all values are strings)
- Object-map entries use 12-char hex IDs as keys (collections)
- Model definitions use valid kinds: `singleton`, `collection`, `document`, `dictionary`

### 3.2 Content Quality (severity: warning)

Reference: `rules/shared/content-quality.md`

- Title length: 50-60 characters
- Excerpt/description: 120-160 characters, complete sentence, ends with period
- No placeholder text: no "Lorem ipsum", "TODO", "TBD", "[insert here]", "Sample text"
- No duplicate content across entries (titles, descriptions, body text)
- Content follows the correct content type pattern (blog post structure, landing page structure, etc.)
- Tone matches `context.json > conventions.tone` consistently throughout
- Vocabulary terms match `vocabulary.json` exactly
- Active voice preferred over passive voice
- Heading hierarchy is sequential (H1 > H2 > H3, no skips)
- Exactly one H1 per page/entry

### 3.3 SEO (severity: warning)

Reference: `rules/shared/seo-rules.md`

- Slug format: lowercase, hyphenated, 3-5 words, no special characters
- Published slugs have not been changed (breaking change)
- Slugs are identical across all locales
- Meta description: 120-155 characters, complete sentence, unique
- Primary keyword within first 30 characters of title
- All images have alt text (or explicit empty string for decorative)
- OG fields populated if model supports them

### 3.4 Accessibility (severity: warning)

Reference: `rules/shared/accessibility-rules.md`

- Link text is descriptive and self-explanatory — no "click here", "read more", "learn more"
- Heading levels reflect document hierarchy, no skipped levels
- Alt text describes content and function, not appearance
- Alt text does not start with "Image of" or "Photo of"
- Alt text under 125 characters
- No color-only references to convey meaning
- Error messages identify the field, describe the error, and explain how to fix it
- Reading level appropriate for content type (grade 8-10 general, grade 6-8 critical)

### 3.5 Security (severity: error)

Reference: `rules/shared/security-rules.md`

- No `<script>` tags in richtext or markdown fields
- No `javascript:` protocol in any attribute value
- No event handler attributes (`onerror`, `onclick`, etc.)
- No forbidden HTML tags (`<iframe>`, `<embed>`, `<object>`, `<form>`, etc.)
- No secrets or credentials: API keys, tokens, private keys, connection strings
- No PII in non-typed fields (emails in non-email fields, phones in non-phone fields)
- All URLs use `https://` (exception: localhost for development)
- No path traversal sequences (`../`, `..\\`)
- No executable file extensions disguised as other types

### 3.6 Internationalization (severity: error for completeness, warning for quality)

Reference: `rules/shared/i18n-quality.md`

- All supported locales have entries for every content item (error if missing)
- All required fields populated in every locale (error if empty)
- Translations are idiomatic, not word-for-word literal (warning)
- Tone preserved across locales (warning)
- Technical terms follow vocabulary or kept in original form (warning)
- Brand terms match vocabulary per locale (warning)
- Translated text fits within field `max` constraints (error)
- Dictionary keys use semantic dot-notation, always in English (warning)
- Plural forms use correct CLDR categories for each language (warning)

### 3.7 Structural (severity: warning)

- JSON files follow canonical serialization: sorted keys, 2-space indent, trailing newline
- Collection files use object-map format with sorted entry IDs
- No orphan references (relation targets that do not exist)
- Model IDs are kebab-case
- Field keys are snake_case
- Dictionary keys use dot-notation
- Naming conventions are consistent with existing content

---

## Step 4: Recommend Action

Based on the review, recommend one of these actions:

### Approve

All checks pass. No errors, no critical warnings. Content is ready to merge.

```
Recommendation: APPROVE
- Schema compliance: PASS
- Content quality: PASS
- SEO: PASS (or N/A if not public-facing)
- Accessibility: PASS
- Security: PASS
- i18n: PASS (or N/A if single locale)
- Structural: PASS
```

### Request Changes

No blocking errors, but warnings that should be addressed before merge.

```
Recommendation: REQUEST CHANGES
Findings:
- [warning] Title "X" is 45 characters, below recommended 50-60 range
- [warning] Missing alt text on hero image
- [warning] German translation of "Settings" uses "Konfiguration" instead of vocabulary term "Einstellungen"
```

### Reject

Blocking errors that must be fixed. Content cannot be merged in current state.

```
Recommendation: REJECT
Findings:
- [error] Required field "excerpt" is empty in entry "a1b2c3d4e5f6"
- [error] Relation field "author" references non-existent entry "x9y8z7w6v5u4"
- [error] Missing locale file: content/blog/blog-post/tr.json
- [error] XSS pattern detected: <script> tag in richtext field "body"
```

---

## Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| `error` | Must fix before merge. Content is invalid or unsafe. | REJECT until fixed |
| `warning` | Should fix. Content is valid but does not meet quality standards. | REQUEST CHANGES or note in approval |
| `info` | Optional improvement. Content is acceptable but could be better. | Note in approval, do not block |

---

## Review Report Format

Structure your review as follows:

```
## Review: [branch-name]

### Summary
[1-2 sentence summary of what this branch changes]

### Findings

#### Errors (must fix)
- [error] Description of issue → File: path, Field: name

#### Warnings (should fix)
- [warning] Description of issue → File: path, Field: name

#### Info (optional)
- [info] Suggestion for improvement → File: path, Field: name

### Recommendation
[APPROVE | REQUEST CHANGES | REJECT]

### Notes
[Any additional context, suggestions, or observations]
```

---

## Checklist

- [ ] All new/modified files examined
- [ ] Schema compliance verified for every entry
- [ ] Content quality checked against content-quality.md
- [ ] SEO rules applied to public-facing content
- [ ] Accessibility rules checked
- [ ] Security scan performed (XSS, secrets, PII)
- [ ] i18n completeness verified (all locales present)
- [ ] Translation quality assessed (not just present, but correct)
- [ ] Structural integrity confirmed (canonical JSON, naming conventions)
- [ ] Clear recommendation provided with specific findings
