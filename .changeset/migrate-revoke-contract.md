---
"@contentrain/types": minor
---

Migrate-Studio revoke contract (`POST /api/migrate/grants/revoke`): `MigrateRevokeRequest` (the signed S2S envelope plus a `reason`: refund before/after delivery, failed delivery, ops), `MigrateRevokeResponse` (`state: 'revoked'`, `installed`, `subscription_canceled`) and their validators. Migrate's half of a refund: the Studio year that rode on the bundle's checkout stops; the money itself is refunded in Polar by an operator.
