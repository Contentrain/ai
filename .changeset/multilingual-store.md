---
"@contentrain/types": minor
"@contentrain/wp-import": minor
---

Multilingual sites import as an i18n store

`RawPost.lang` carries a post's language as the plugin reports it (Polylang
`lang` / `language` term, WPML `wpml_current_locale`), and the REST and WXR
importers fill `RawIR.language_pairs` from Polylang `translations` /
`post_translations` and WPML `wpml_translations` — one pair per group.

`rawToContentrain` sees more than one locale and switches post-type models to
`i18n: true`: content and meta per locale, one shared entry id per translation
group (canonical = default-locale post, else lowest id), `entry_source_map`
locale per post, `config.locales.supported` listing every locale. Language
bookkeeping taxonomies never become models. Monolingual sites are unchanged.
Until now the REST path dropped `lang` and Migrate had to patch locales into
the source map by hand.
