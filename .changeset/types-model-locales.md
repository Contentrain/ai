---
"@contentrain/types": minor
---

`ModelDefinition` gains optional `locales?: string[]`: the project locales a model's content actually covers, a subset of `config.locales.supported`. Absent — as on every model that predates the field — means every supported locale, so nothing changes for a fully-translated project.

Three pure helpers come with it. `resolveModelLocales(model, config)` returns the locales a model is expected to cover and whether that list came from the model or the project (`ModelLocaleScope`), `describeModelLocaleScope(scope)` names it the way a validation message should quote it, and `validateModelLocales(model, config)` rejects a declaration that cannot be honoured: a locale outside `locales.supported`, an empty list, a duplicate, a non-string entry. Declaring it on an `i18n: false` model is a warning, not an error.

`MODEL_FIELD_ORDER` carries `locales` between `i18n` and `title_field`, so canonical model JSON keeps the identity keys together.
