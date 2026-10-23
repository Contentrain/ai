---
"@contentrain/types": minor
"@contentrain/wp-import": minor
---

RawIR multilingual fields, as the Contentrain Bridge (0.8.0) exports them from Polylang or WPML: `languages` (the plugin, its default, the URL scheme from its own setting, `hide_default`, `rewrite`, and each language with Polylang's `pll/v1` field names, values unnormalised), `term_pairs` (one term translation group per row), `strings` (translated interface strings), `RawTerm.lang`, `RawMenu.lang`, `RawLanguagePair.missing_translations`, and `RawAcfOptionsPage.lang` / `translations`. All optional. `rawToContentrain` reads `term_pairs` and `RawTerm.lang`: on a multilingual site a taxonomy whose terms carry a language becomes an i18n model, content per locale, every translation of a term shares its group's entry id (default-locale member, else the lowest id), and every reference to a term (a post's taxonomy field, primary category, ACF, menu target, parent) resolves to that id. `report.term_translation_groups` counts the groups. Terms without a language import as before.
