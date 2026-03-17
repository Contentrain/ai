---
description: I18n Quality — Contentrain content governance
trigger: always_on
---

# Internationalization (i18n) Quality Rules

These rules govern translation and localization quality for all content managed through Contentrain.
Every rule applies whenever the project has more than one locale configured.

---

## 1. Translation Completeness

### 1.1 Coverage Requirement

- Read `.contentrain/config.json` → `locales.supported` to determine the full list of supported locales.
- EVERY entry that exists in the source locale MUST have a corresponding entry in ALL supported target locales.
- Missing translations are deployment blockers. Treat a missing locale file as an error, not a warning.

### 1.2 Dictionary Entries

- Every key present in the source locale file MUST exist in every target locale file.
- No partial dictionaries. If a new key is added, add it for ALL locales in the same operation.
- If the agent cannot produce a quality translation, insert the source-locale text and set status to `draft` — never leave the key absent.

### 1.3 Document and Singleton Entries

- When creating a new document or singleton entry, create locale files for ALL supported locales.
- The source locale file is the reference. Target locale files must contain translations of every field.
- Required fields in the model must be populated in every locale — empty required fields are invalid.

### 1.4 Completeness Verification

Before committing, run this check:

1. List all entry IDs in the source locale directory.
2. For each target locale, confirm the same set of IDs exists.
3. For each entry, confirm all required fields have non-empty values.
4. Report any gaps as errors.

---

## 2. Translation Quality

### 2.1 Idiomatic Translation

- Translate MEANING, not words. Literal word-for-word translation produces unnatural text.
  - EN: "It's raining cats and dogs" → TR: "Bardaktan bosanircasina yagmur yagiyor" (NOT "Kediler ve kopekler yagiyor")
- Sentence structure must follow target language grammar, not source language grammar.
- Read translated text aloud mentally — if it sounds unnatural, rewrite it.

### 2.2 Machine Translation Artifacts

Detect and fix these common machine-translation problems:

- Overly literal translations that ignore idiom.
- Incorrect gender agreement (common in Romance, Slavic, Turkic languages).
- Wrong register/formality (e.g., using informal "du" in German business content).
- Untranslated fragments left in source language mid-sentence.
- Garbled word order that follows source language syntax.

### 2.3 Tone Preservation

- If the source content is casual, the translation must be casual in the target language.
- If the source content is formal, the translation must use formal register.
- Check `context.json` → `conventions.tone` — it applies to ALL locales.
- Formality mapping varies by language:
  - German: use "Sie" (formal) for professional content, "du" for casual.
  - French: use "vous" (formal) by default, "tu" only if explicitly configured.
  - Turkish: use "siz" (formal) for professional, "sen" for casual.
  - Japanese: use desu/masu form for professional content.

### 2.4 Technical Terms

- Keep technical terms in their original form if no widely accepted translation exists.
  - Keep as-is: "API", "webhook", "SSL", "DNS", "SDK", "CLI", "URL".
  - Translate if established: "database" → "Datenbank" (de), "browser" → "navegador" (es).
- Check `vocabulary.json` for approved translations of technical terms per locale.
- If `vocabulary.json` specifies a translation, use it. Do not override with a different translation.

### 2.5 Brand Terms

- Brand terms from `vocabulary.json` → `brand_terms` must be used exactly as specified per locale.
- Some brand terms are never translated (product names, company names).
- Some brand terms have locale-specific variants — use the variant defined in vocabulary.

---

## 3. Cultural Adaptation

### 3.1 Date Formats

Reference the target locale convention when writing date examples or references in content:

| Locale | Format | Example |
|---|---|---|
| en-US | MM/DD/YYYY | 03/15/2025 |
| en-GB | DD/MM/YYYY | 15/03/2025 |
| de, fr, tr, most EU | DD.MM.YYYY or DD/MM/YYYY | 15.03.2025 |
| ja, zh, ko | YYYY/MM/DD or YYYY年MM月DD日 | 2025/03/15 |
| ISO 8601 | YYYY-MM-DD | 2025-03-15 |

- Do not hardcode date strings. If content references a date, use locale-appropriate formatting.
- When in doubt, use ISO 8601 format.

### 3.2 Number Formats

| Convention | Thousands | Decimal | Locales |
|---|---|---|---|
| Period-decimal | 1,000.00 | `.` | en, ja, zh, ko |
| Comma-decimal | 1.000,00 | `,` | de, fr, tr, es, pt, it, nl |
| Space-thousands | 1 000,00 | `,` | fr (formal), sv, fi, pl |

- Match the target locale convention when writing numbers in content.
- Currency values: always specify the currency code (USD, EUR, TRY). Never assume currency from locale alone.

### 3.3 Units of Measurement

- en-US: imperial (miles, pounds, Fahrenheit) unless the context is scientific.
- Most other locales: metric (kilometers, kilograms, Celsius).
- Match the target locale convention. If content says "5 miles" in en-US, the de translation should say "8 km".

### 3.4 Cultural Sensitivity

- Food, gestures, symbols, and colors carry different meanings across cultures.
- Do not reference culturally specific holidays as universal (e.g., "Thanksgiving" is US/Canada-specific).
- When referencing imagery in content, ensure descriptions are culturally appropriate for the target locale.
- Avoid idioms that do not translate — replace with locale-appropriate equivalents.

---

## 4. String Length Awareness

### 4.1 Expansion Ratios

Expect these approximate expansion ratios from English source text:

| Target Language | Expansion | Notes |
|---|---|---|
| German | +30-40% | Compound words, longer sentences |
| Finnish | +30-40% | Agglutinative morphology |
| Dutch | +25-35% | Longer compound words |
| French | +15-25% | Articles, prepositions |
| Spanish | +15-25% | Longer verb forms |
| Portuguese | +15-25% | Similar to Spanish |
| Italian | +10-20% | Moderate expansion |
| Turkish | +10-20% | Suffixation expands words |
| Russian | +10-15% | Moderate expansion |
| Chinese (zh) | -30-50% | Fewer characters, wider glyphs |
| Japanese (ja) | -20-40% | Mixed scripts, compact |
| Korean (ko) | -10-20% | Syllable blocks |
| Arabic (ar) | -10-20% | Compact script, RTL |

### 4.2 Field Constraints

- Check the model's `max` field constraint for every text field.
- The translated text MUST fit within the `max` character limit.
- If a translation exceeds the limit, rewrite it shorter. Do NOT truncate mid-word or mid-sentence.
- Test the longest expected language (usually German or Finnish) against all max constraints.

### 4.3 UI String Considerations

- Button labels, menu items, and form labels have tight space constraints.
- German button text may need abbreviation or restructuring to fit.
- Verify that translated UI strings do not break layout assumptions.

---

## 5. Dictionary Key Naming

### 5.1 Naming Convention

- Use semantic, hierarchical, dot-separated keys.
  - GOOD: `auth.login.button`, `errors.404.title`, `nav.main.dashboard`
  - BAD: `button1`, `text_3`, `label_top`, `str_47`
- Key names are always in English regardless of locale.
- Use lowercase with dots as separators. No spaces, no camelCase, no PascalCase in keys.

### 5.2 Grouping

- Group keys by feature or domain, not by page or visual position.
  - GOOD: `auth.login.button`, `auth.login.email_label`, `auth.login.error`
  - BAD: `login_page.top_button`, `login_page.first_input`, `login_page.red_text`
- Top-level groups: `auth`, `nav`, `errors`, `forms`, `common`, `notifications`, `settings`.
- Add new groups only when existing groups do not fit.

### 5.3 Consistency

- Similar concepts use similar key structures across features.
  - `auth.login.button` and `auth.signup.button` — parallel structure.
- Do not use different naming patterns for the same concept.
- Before adding a new key, check existing keys for established patterns.

---

## 6. RTL Language Support

### 6.1 RTL Locales

Flag these locales as right-to-left:

- Arabic (`ar`)
- Hebrew (`he`)
- Persian / Farsi (`fa`)
- Urdu (`ur`)
- Pashto (`ps`)
- Sindhi (`sd`)

### 6.2 Content Rules for RTL

- Body text flows right-to-left. Do not force LTR markers in body content.
- Embedded elements that remain LTR: numbers, URLs, email addresses, code snippets, brand names in Latin script.
- Punctuation placement follows RTL rules: period at the left end of a sentence.
- Lists and bullet points align to the right margin.

### 6.3 Bidirectional Text

- When RTL text contains LTR segments (e.g., a product name in English), ensure proper Unicode bidi handling.
- Do not manually insert Unicode directional markers (LRM, RLM) in content — leave that to the rendering layer.
- Test that mixed-direction content reads correctly in sequence.

---

## 7. Pluralization

### 7.1 Plural Categories

Languages have different plural rule counts:

| Category | Languages | Plural Forms |
|---|---|---|
| No plurals | Chinese, Japanese, Korean, Vietnamese | 1 (`other`) |
| Two forms | English, German, Dutch, Spanish, Italian, Portuguese, Turkish | 2 (`one`, `other`) |
| Three forms | French, Brazilian Portuguese | 2-3 (`one`, `other`, sometimes `many`) |
| Multiple forms | Russian, Polish, Czech, Ukrainian | 3-4 (`one`, `few`, `many`, `other`) |
| Complex | Arabic | 6 (`zero`, `one`, `two`, `few`, `many`, `other`) |

### 7.2 Dictionary Key Structure for Plurals

- Use CLDR plural categories as key suffixes:
  - `items.zero` — zero items (where applicable)
  - `items.one` — exactly one item
  - `items.two` — exactly two items (Arabic)
  - `items.few` — small numbers (language-specific rules)
  - `items.many` — large numbers (language-specific rules)
  - `items.other` — default/fallback (REQUIRED for every plural set)
- The `other` key is mandatory. It is the fallback for any count not covered by other categories.
- Only include the plural categories relevant to the target language.
  - English: `items.one`, `items.other`
  - Arabic: all six categories

### 7.3 ICU Message Format

- When the project uses ICU message format, reference it correctly:
  - `{count, plural, one {# item} other {# items}}`
- Do not invent custom pluralization logic. Use the established format.

---

## 8. Vocabulary Alignment

### 8.1 Cross-Locale Vocabulary

- `vocabulary.json` must have entries for ALL supported locales.
- When adding a new canonical term, provide the translation for every supported locale.
- If a term has no natural translation, mark it as "keep original" in the vocabulary entry.

### 8.2 Consistency Enforcement

- Every occurrence of a canonical term in every locale must match `vocabulary.json`.
- Run vocabulary checks across all locales, not just the source locale.
- If a translated term appears inconsistent (e.g., "Einstellungen" in one entry and "Konfiguration" in another for "Settings"), flag it and use the vocabulary-defined term.

### 8.3 Adding New Terms

- Do not add new terms to `vocabulary.json` without human approval.
- When the agent encounters a term that should be canonical but is not in the vocabulary, flag it in the commit message or review notes.
- New terms must include: source term, translation for each locale, context/usage note.

---

## Validation Checklist

Before committing any multilingual content, verify:

- [ ] All supported locales have entries for every content item
- [ ] All required fields are populated in every locale
- [ ] No machine-translation artifacts (literal translations, wrong grammar)
- [ ] Tone matches source content in all target locales
- [ ] Technical terms follow `vocabulary.json` or are kept in original form
- [ ] Brand terms exactly match `vocabulary.json` per locale
- [ ] Translated text fits within field `max` constraints
- [ ] Date, number, and currency formats match target locale
- [ ] Dictionary keys are semantic, hierarchical, and in English
- [ ] Plural forms use correct CLDR categories for each language
- [ ] RTL locales are flagged and content follows RTL rules
- [ ] Vocabulary entries exist for all terms in all supported locales
