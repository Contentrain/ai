---
'@contentrain/types': minor
---

`MigrateGrantStatusResponse` gains optional `kind` (`trial` | `bundle` | `covered`), `plan`, `trial_days`, `ends_at`, `ended` and `notice`: what kind of Studio an order has and, when the plan the site lives on has ended, Studio's own text for it. Additive; `validateMigrateGrantStatusResponse` checks them when present.
