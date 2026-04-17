---
name: contentrain-translate
description: "Translate Contentrain content across supported locales. Use when adding translations, localizing content, or managing multi-language entries."
metadata:
  author: Contentrain
  version: "1.0.0"
---

# Skill: Translate Content to a New Locale

> Translate existing content entries to a target locale, following i18n quality rules.

---

## When to Use

The user wants to translate content, add a new language, or says something like "translate to Turkish", "add German locale", "create French translations", "fill in missing translations", "localize".

---

## Steps

### 1. Check Project State

Call `contentrain_status` to understand:

- Supported locales (from `config.json` → `locales.supported`).
- Source locale (from `config.json` → `locales.source`).
- Available models and their i18n status.
- Any pending changes or validation errors.

### 2. Determine Target Locale

If the user specified a locale, use it. Otherwise:

- Ask which locale to translate to.
- If the target locale is not in `locales.supported`, inform the user it needs to be added to the configuration first.

### 3. Select Models to Translate

Identify which models need translation:

- List all models with `i18n: true`.
- For each model, call `contentrain_content_list(model: "<modelId>", locale: "<sourceLocale>")` to get the source content.
- Check which models already have entries in the target locale by calling `contentrain_content_list(model: "<modelId>", locale: "<targetLocale>")`.
- Report the translation gap: how many entries exist in the source locale but not the target.

Ask the user which models to translate, or offer to translate all models with missing entries.

### 4. Load Vocabulary

Read `.contentrain/vocabulary.json` for canonical term translations. All vocabulary-defined terms must use the exact translation specified for the target locale — do not create alternative translations.

### 5. Translate Following i18n Rules

Apply the rules from `i18n-quality.md` during translation:

#### Translation Quality

- Translate meaning, not words. Produce idiomatic text in the target language.
- Match the sentence structure of the target language, not the source.
- Preserve the tone: if the source is casual, the translation must be casual. If formal, stay formal.
- Fix any machine-translation artifacts: literal translations, incorrect gender agreement, wrong register.

#### Vocabulary Alignment

- Check `.contentrain/vocabulary.json` for approved translations of terms in the target locale.
- Keep technical terms in their original form if no widely accepted translation exists (API, SDK, CLI, URL).
- Use brand terms exactly as specified per locale in the vocabulary.
- Do not alternate between synonyms — use the same translation for repeated terms throughout.

#### Cultural Adaptation

- Adapt idioms, metaphors, and culturally specific references. Do not translate literally when a cultural equivalent exists.
- Use locale-appropriate date formats, number formats, and units of measurement.
- Replace culturally specific references with locale-appropriate equivalents.
- Avoid idioms that do not translate — use target-language equivalents.

#### String Length Awareness

- Check field `max` constraints in the model definition.
- Account for expansion ratios: German +30-40%, French +15-25%, Chinese -30-50%.
- If a translation exceeds the field limit, rewrite it shorter. Never truncate mid-word.
- Pay special attention to UI strings (button labels, menu items) with tight space constraints.
- Flag any fields that hit `max` constraints.

#### Pluralization

- Use correct CLDR plural categories for the target language.
- English: `one`, `other`. German: `one`, `other`. Russian: `one`, `few`, `many`, `other`. Arabic: all six categories.

#### Preserve Non-Translatable Content

- Keep relation IDs, slugs, URLs, image paths, and code snippets unchanged — only translate human-readable text.
- Preserve markdown structure, HTML tags, line breaks, and whitespace patterns from the source.
- Entry IDs (object-map keys) remain the same across locales.

### 6. Kind-Specific Rules

- **singleton:** Translate all string/text/markdown/richtext fields.
- **collection:** Translate each entry's fields. Use the same entry IDs across locales.
- **document:** Translate frontmatter fields and markdown body. Slug may stay the same or be localized (ask the user).
- **dictionary:** Translate all values. Keys remain identical across locales (e.g., `"auth.login"` key stays the same, value changes).

### 7. Present Translations for Review

Show the user a side-by-side comparison:

```
Model: hero (singleton)
Field: title
  en: "Build faster with AI"
  tr: "AI ile daha hizli gelistirin"

Field: description
  en: "Ship content-driven apps in minutes"
  tr: "Icerik odakli uygulamalari dakikalar icinde yayinlayin"
```

Wait for user approval. The user may request adjustments to tone, phrasing, or terminology.

### 7.5. Bulk Copy for New Locales

When translating a model to a brand-new locale, use `copy_locale` to bootstrap the target locale with source content before translating:

```
contentrain_bulk({ operation: "copy_locale", model: "<model-id>", source_locale: "en", target_locale: "<target>" })
```

This creates target locale files with the source content as a starting point. Then translate each entry's values in-place — keys and entry IDs remain identical.

After all translations are saved, re-generate the SDK client so the application picks up the new locale data:

```bash
npx contentrain generate
```

### After Translation: SDK Regeneration

New locale data requires SDK client regeneration:

```bash
npx contentrain generate
```

### 8. Save Translations

After approval, call `contentrain_content_save` for each model and target locale:

```
contentrain_content_save(model: "<model-id>", entries: [
  { id: "<same-id>", locale: "<target-locale>", data: { ...translatedFields } }
])
```

Use the same `id` (for collections) or `slug` (for documents) as the source entry to maintain the cross-locale link. Batch all entries for a model in one call.

### 9. Validate

Call `contentrain_validate` to verify:

- i18n completeness — all source locale keys exist in the target locale.
- Schema compliance — translated values respect field constraints (`min`, `max`, `pattern`).
- Vocabulary alignment — vocabulary terms match their canonical translations.
- Referential integrity — relation fields are unchanged and still valid.

If validation fails, fix issues and re-save.

### 10. Submit

Call `contentrain_submit` to commit the translations:

- Branch: `contentrain/content/{model}/{targetLocale}/{timestamp}`.
- Each locale can be submitted independently.

### 11. Final Summary

Report to the user:

- Models translated: X.
- Entries translated: X.
- Target locale(s): X.
- Vocabulary terms applied: X.
- Any fields that hit `max` constraints (flagged for review).
- Validation result.
- Submission status.
- Reminder to review translations for nuance that automated checks cannot catch.
- Suggestion: run `/contentrain-review` to verify overall i18n coverage.

## Related Skills

- **contentrain-serve** — Review translated content in browser
- **contentrain-generate** — SDK regeneration for new locale data
- **contentrain-quality** — Translation quality rules
- **contentrain** — Core architecture and MCP tool catalog
