---
"contentrain": minor
---

New `contentrain import` command: imports a WordPress site into a `.contentrain` content store — from a WXR export file or a REST URL (`--auth user:app-password` lifts the access rung). Writes the canonical store, `import-report.json`, `entry-source-map.json`, and — when the source has comments — a `contentrain-comments@1` export ready for a comments-service intake. Guards existing stores behind `--force`.
