---
"@contentrain/verify": minor
---

New check, `status.baseline-page-missing` (error): a page the baseline answered with 2xx that the build does not serve, and no redirect rule covers. `status.mismatch` walks the build's own documents, so a page the migration never produced was compared against nothing and reported by nothing, while every link and search result pointing at it ended on a 404. The check walks the baseline instead. It runs for a build (`input.build`) only — a set of captured pages may simply not include one — and otherwise names itself in `report.skipped`. Baseline redirects and errors are not pages and do not count, nor does the old site's 404 page.
