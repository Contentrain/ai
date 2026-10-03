---
"@contentrain/types": minor
---

`MigrateProvisionResponse` is now `MigrateProvisionCheckout | MigrateProvisionCovered`. When the account already runs a plan that covers the sized one, Studio answers `state: 'redeemed'` with the workspace and no checkout: `checkout_url`, `amount_cents` and `checkout_expires_at` are forbidden then, and still required for every other state. `validateMigrateProvisionResponse` checks both directions.
