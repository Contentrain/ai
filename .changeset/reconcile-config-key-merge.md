---
"@contentrain/mcp": minor
---

Reconcile merges `.contentrain/config.json` by top-level key

Project settings are a keyed record and the two sides move different keys — a
branch renames the content root while main flips the workflow. Treating the file
as opaque made every such pair a `file_conflict` that stopped reconcile until
someone chose a side, and choosing a side discards the other change.

`config.json` now follows the `normalize-sources.json` rule: merge by top-level
key, and only a key BOTH sides moved *differently* becomes a question. The
conflict code stays `file_conflict` (the closed set Studio keys its localized
questions on is unchanged) and now carries the disputed `key`, so the rest of
the file merges while one key waits for a decision.
