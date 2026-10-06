---
'@contentrain/types': minor
---

`MigrateGrantStatusResponse` gains optional `workspace_github_account` (`{ login, type: 'User' | 'Organization' }`): the GitHub account the grant's workspace has Studio's GitHub App installed on, so Migrate's delivery can default to it. Absent when there is no installation. Additive; `validateMigrateGrantStatusResponse` checks it when present.
