---
"@contentrain/mcp": minor
"@contentrain/rules": minor
"@contentrain/skills": minor
"@contentrain/claude-plugin": patch
---

feat(mcp): vocabulary can be written through a tool

Field reports M3 and M4.

The vocabulary was the one part of `.contentrain/` with no write tool, while
the rules forbid editing that directory by hand. There was no way to obey
both, so a field report edited the file directly — correctly, for lack of an
alternative.

`contentrain_vocabulary_save` and `contentrain_vocabulary_delete` close that,
through the same plan → commit path as content and models: a vocabulary change
lands on a `cr/*` branch and follows the project's workflow like anything else.

- save merges. A term you omit is untouched, and adding a Turkish translation
  does not drop the English one
- replacing a translation is allowed and reported with the value it replaced
- two terms sharing a translation is reported — that is precisely what a
  vocabulary exists to prevent
- delete reports an unknown slug in `missing` rather than failing, and a call
  matching nothing returns `no-op` without opening a branch

The shape is now stated, and enforced. `terms` nests as
`{ "sign-in": { "en": "Sign in" } }` — the outer key is the term, the inner
key is a locale. It reads identically the other way round, and a field report
built it locale-first because nothing said which; MCP accepted it, producing a
vocabulary that was structurally valid and matched nothing. Term slugs must be
kebab-case and locale keys must be locale codes, so the inversion is refused
at the point of writing with a message naming the shape it wanted.

`describe_format` carried the ambiguity too: it described `terms` as
`Record<category, Record<slug, translation_value>>`, which is not what the
code reads. It now names the real shape and carries an example, which is the
only description of a symmetric nesting that cannot be misread.
