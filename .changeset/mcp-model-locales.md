---
"@contentrain/mcp": minor
---

`contentrain_validate` checks an i18n model's locale coverage against `model.locales` when the model declares one, and against `config.locales.supported` when it does not. A partially-translated site — pages in one language beside a blog in three — no longer fails on translations it never had, and no longer has to invent empty locale files or drop a locale from the whole project to get a clean run.

Severity is unchanged and still follows the model kind: a missing translation is a warning on a `document` model and an error on a `collection`. Every locale-coverage message now names the list it was evaluated against — `(checked against the model's own locales [en, tr])` or `(checked against the project's supported locales [en, tr, da])` — so the two cases read apart without opening config.json.

`contentrain_model_save` accepts `locales` and rejects a locale outside `config.locales.supported`. `contentrain_validate fix:true` reports a broken declaration but never invents one: narrowing a model's coverage is a content decision, and the only value the tool could derive — the locales that happen to have files today — would write the current gaps into the schema and silence the errors that reveal them.
