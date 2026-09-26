---
"@contentrain/types": minor
---

Migrate → Studio claim: optional `comments_export` (`{ url, expires_at, comments }`), the signed address Studio fetches a migrated site's comment export from. The export never enters the repository; `validateMigrateStudioClaim` checks the URL (https, http for localhost; no credentials or fragment), that `expires_at` is after `iat`, and the count.
