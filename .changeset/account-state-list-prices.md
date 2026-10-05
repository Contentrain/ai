---
"@contentrain/types": minor
---

`MigrateAccountStateResponse` types `renewal_cents` (already sent by Studio) next to a new optional `monthly_list_cents`: the sized plan's monthly list price × 12, in cents, which the Migrate offer shows as the struck-through price. `validateMigrateAccountStateResponse` checks it (an integer in cents when present, positive unless the state is `covers`); both stay optional, so an answer from a Studio that predates them is still valid.
