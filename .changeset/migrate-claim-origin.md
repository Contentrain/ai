---
"@contentrain/types": minor
---

`MigrateStudioClaim` gains an optional, signed `origin` — the migrated WordPress site as a bare origin (`https://host`; `http:` only for localhost). `validateMigrateStudioClaim` rejects anything that is not a canonical origin, so Studio can store it on the grant and fetch media from it alone.
