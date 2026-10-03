---
'@contentrain/types': minor
---

Migrate-Studio provision contract: `MigrateProvisionResponse` and `validateMigrateProvisionResponse` (Studio's answer to `POST /api/migrate/provision`, whose request is the signed `MigrateStudioClaimV2`). The checkout address must be a Polar checkout and the amount must equal the request's quote.
