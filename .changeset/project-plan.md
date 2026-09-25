---
'@contentrain/types': minor
---

`ProjectPlan` (`contentrain-project-plan@1`): the migration plan between Migrate's fact pack and the project writer. It holds the site config (mirrors the starter's `site.config.ts`, plus URL, redirects and kit design roles), models (imported, or plan models filled by deterministic extraction from builder elements), components (kit or site-specific), routes and placements whose props are bound to content, never copied, and the decision audit trail. `validateProjectPlan` checks that every reference resolves before anything is written.
