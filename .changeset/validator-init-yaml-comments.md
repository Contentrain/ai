---
"@contentrain/types": minor
"@contentrain/mcp": minor
"contentrain": minor
"@contentrain/query": patch
---

Validator and init gaps (#512).

- **validate checks document file names against the slug rule.** A file such as `Bad_Name.md` could be read but never saved, because every write rejects that slug. validate now reports it as an error, once per slug, and suggests the slug to rename it to (`"bad-name"`).
- **`contentrain init --locales` / `--domains`.** Both take a comma-separated list (`--locales tr`, `--locales en,tr`, `--domains docs`), where the first locale is the default. They work with `--yes` and skip the matching prompt in interactive mode. An invalid locale or domain stops init before anything is written.
- **A YAML inline comment is no longer read as part of the value.** `status: draft # todo` reads as `draft`, `title: "A" # x` as `A` (quotes resolved) and `tags: [a, b] # x` as the list. `C#`, `"a # b"` and a value that starts with `#` keep their `#`. The rule is one exported function, `stripFrontmatterComment`, used by the content engine and by `@contentrain/query`'s generator and Astro loader alike. The comment is not written back on save, so validate warns about each such line (`frontmatterCommentKeys`).
