---
"@contentrain/types": minor
---

`MigrateAccountStateRequest.github_user_id` is optional. Without it the request asks for the sized plan's list price before the customer signs in, and Studio answers `none`, as for a GitHub account with no Studio plan. `validateMigrateAccountStateRequest` accepts a request without the field; a present one is still checked (a decimal GitHub id), and `null` or `''` is refused.
