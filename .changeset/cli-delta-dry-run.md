---
"contentrain": minor
---

New `contentrain delta <delta.json> --incoming <dir> --dry-run`: plans a WordPress source delta against the store, and prints a report or, with `--json`, the planned `SourceDeltaPlan`. The plan covers placement, field changes, conflicts with repository edits, tombstones and redirects. There is no apply mode. Without `--dry-run` the command refuses, because applying a plan goes through review.
