---
"@contentrain/types": minor
---

Component mounting and runtime binding contracts

- `COMPONENT_TYPES` gains `form` — a migrated contact form is a runtime
  capability of its own, distinct from `comments`.
- `CHROME_COMPONENT_OPEN` / `CHROME_COMPONENT_CLOSE` and `componentSlot(id)`:
  the `<!--@@component:ID@@-->` marker a producer puts in body chrome where a
  component belongs. Same family as `CHROME_BODY_SLOT`, for the same reasons.
- `ComponentDef.model` — the content model a `form` component submits to.
- `RuntimeBinding` (`base_url` + `project_id`, never a credential) and
  `MigrationHandoff.runtime` — where a generated site's runtime components
  were bound when an offer was fulfilled.
