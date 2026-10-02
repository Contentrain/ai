---
'@contentrain/types': minor
---

Migrate→Studio claim v2 ("Migrate with Studio"). `MigrateStudioClaimV2`, `validateMigrateStudioClaimV2` and `validateMigrateStudioClaimAny` (routes by `v`). v2 drops `trial_days` and adds `github_user_id`, `email_verified`, `return_url`, optional `embed_origin` and a signed `billing` quote (`migrate_fee_cents`, `quoted_total_cents`, `currency`) so Studio can create the first-invoice checkout server to server and refuse a price mismatch. v1 and its validator are unchanged.
