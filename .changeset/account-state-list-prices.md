---
"@contentrain/types": minor
---

`MigrateAccountStateResponse` types `renewal_cents` (already sent by Studio) next to a new optional `monthly_list_cents`: the sized plan's monthly list price × 12, in cents, which the Migrate offer shows as the struck-through price. `validateMigrateAccountStateResponse` checks it (a positive integer when present); both stay optional, so an answer from a Studio that predates them is still valid.
