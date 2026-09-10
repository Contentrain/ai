---
"@contentrain/query": minor
"contentrain": minor
---

Add opt-in public build filtering to generation and the Astro loader: `publishedOnly` and reproducible ISO `at` options, exposed as `generate --published --at <timestamp>` by both CLIs. Collection, dictionary, singleton and document metadata use the same publication-window predicate. Watchers react to metadata changes. Existing editorial generation remains unchanged; timed static publication still requires a scheduled rebuild and deployment.
