---
'@contentrain/types': minor
---

Migrate→Studio claim v2 ("Migrate with Studio"). `MigrateStudioClaimV2`, `validateMigrateStudioClaimV2` and `validateMigrateStudioClaimAny` (routes by `v`). v2 drops `trial_days` and adds `github_user_id`, `email_verified`, `return_url` and a signed `billing` quote (`migrate_fee_cents`, `quoted_total_cents`, `currency`) so Studio can create the first-invoice checkout server to server and refuse a price mismatch. v1 and its validator are unchanged.

Also the Offer-time account state: `MigrateAccountStateRequest` / `MigrateAccountStateResponse` (`none` | `covers` | `too_small`, with `year1_cents`) and `validateMigrateAccountStateResponse`.
Plus `validateMigrateAccountStateRequest`, and `validateMigrateAccountStateResponse(response, { requested })` checks the answer against the plan that was asked.
`requested` is required on `validateMigrateAccountStateResponse`.
