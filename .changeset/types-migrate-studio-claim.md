---
"@contentrain/types": minor
---

`MigrateStudioClaim`: the shared contract for Migrate's signed hand-off to a Studio trial.

A paid Migrate order includes a Studio trial. Migrate signs a short-lived claim (compact JWS, EdDSA) at delivery, and Studio verifies it and opens the delivered repository as a project. The new exports are the payload both apps bind to:
- `MigrateStudioClaim`, `MigrateStudioPlanEvidence`, `MigrateStudioRepo`, `MigrateStudioCapability`, `MigrateStudioPlan`;
- the constants `MIGRATE_STUDIO_CLAIM_ISSUER`/`_AUDIENCE`/`_ALG`/`_VERSION`/`_MAX_TTL_SECONDS` (1800)/`_MAX_TRIAL_DAYS` (90)/`_CLOCK_SKEW_SECONDS`;
- `validateMigrateStudioClaim(payload, { now? })`, a pure check of shape, ranges and validity window that returns every problem found;
- `isMigrateStudioClaim`, the shape-only type guard.

Signing and verification stay in the two apps; this package does no cryptography.
