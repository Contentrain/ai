---
"@contentrain/types": minor
"contentrain": minor
---

The serve UI reads the model's declared title, labels and order

serve-ui was still guessing what `title_field`, `label` and `order` now
declare. Its column list called `Object.keys(desc.fields)` under a comment
saying that preserved definition order — it does not, because model JSON is
written with canonically sorted keys, so it was alphabetical. On a
sixteen-field article model that put `author` first and `title` fifteenth,
each column headed by its raw key (`body_public`, `is_category_hero`).

- columns order by `orderedFieldNames`, so a declared `order` wins and fields
  without one keep today's alphabetical fallback
- headers render `resolveFieldLabel`, with the raw key kept as the `title`
  attribute so the underlying field is still discoverable
- the default visible columns lead with `title_field` when the model declares
  one; the existing required-plus-simple-type heuristic fills the rest and
  still covers models that predate the property

Both helpers come from `@contentrain/types`, so the UI and any other consumer
resolve them the same way.

**The secret detector no longer flags documentation about secrets.**

`SECRET_PATTERNS` matched bare prefixes, so `task_id` and `risk_level` tripped
`sk_`, every page documenting `Authorization: Bearer <token>` tripped
`Bearer `, and `postgres://localhost:5432/mydb` in a guide tripped the
connection-string rule. On this repository, which stores its own docs as
content, that was **7 of 12 validation errors** — and the real findings were
buried under them.

Each pattern now matches a credential-shaped *value* rather than prose about
credentials: prefixes need their key body, a bearer token needs an actual
token (not `<token>`, `$TOKEN`, `{{token}}` or `YOUR_TOKEN`), an api key needs
to be assigned one, and a connection string needs embedded credentials.

Two existing assertions changed, because they encoded the false positive:
`my_api_key_value` and `mongodb://localhost/test` are no longer reported. A
check that fires on the wrong thing is not a strict check; it is one people
learn to scroll past.
