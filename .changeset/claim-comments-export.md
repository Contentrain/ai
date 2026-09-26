---
"@contentrain/types": minor
---

Migrate → Studio claim: optional `comments_export` (`{ url, token, expires_at, comments }`): Migrate's fixed address for a migrated site's comment export and the per-job signed token Studio sends as `Authorization: Bearer` — the address carries no secret, so none reaches request logs. The export never enters the repository; `validateMigrateStudioClaim` checks the URL (https, http for localhost; no credentials, query or fragment), the token (compact JWS, at most 2048 characters), that `expires_at` is after `iat`, and the count. A malformed export (an older Migrate's shape included) never fails the claim: it is dropped and reported in the new optional `warnings` of an `ok` result. `isMigrateStudioClaim` returns `false` for such a claim, since it would narrow the malformed export along with it.
