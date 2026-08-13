---
"@contentrain/types": minor
"@contentrain/mcp": minor
"@contentrain/rules": minor
"@contentrain/skills": minor
"@contentrain/claude-plugin": patch
---

feat: fields can declare a label and a display order

A model carries a `name`; its fields carried nothing. Fields are stored in
canonical alphabetical order, so an editor listed them alphabetically — on a
sixteen-field article model `author` first and `title` fifteenth — and
labelled each with its raw key: `body_public`, `is_category_hero`.

`FieldDef` gains two optional properties:

- `label?: string | Record<string, string>` — one label for every locale, or a
  translation per locale. The union is here now rather than later because
  widening `string` to it afterwards breaks every consumer that treats the
  value as a string, and that would cost another major.
- `order?: number` — ascending. Fractional values are allowed so a field can be
  inserted between two others without renumbering.

Fields without an `order` sort after every field that has one, alphabetically
among themselves, so a model that declares neither behaves exactly as it does
today.

Two helpers ship with the types so every consumer resolves them identically
rather than each reimplementing the fallbacks: `orderedFieldNames(fields)` and
`resolveFieldLabel(name, field, locale?, defaultLocale?)`.

Validation: a `label` object's keys must be locale codes. That is the same
inversion the vocabulary is prone to, and a label keyed by anything else
resolves to nothing while looking fine.

Also: a field declared `{ "type": "object" }` with no `fields` now returns a
warning. Nothing validates it and no editor can render it — it shows as an
empty frame. A warning rather than an error, because it is a legitimate state
while a schema is being designed.

All 104 fields across the seven scaffold templates now carry a readable label
and an order numbered in tens.
