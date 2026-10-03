---
'@contentrain/types': minor
---

Migrate→Studio server-to-server contract for the Studio card beside the live move. `MigrateGrantStatusRequest` / `MigrateGrantStatusResponse` (`claimed` | `bound` | `redeemed` | `revoked`, plus whether Studio's GitHub App is `installed`) and `MigrateInstallUrlRequest` / `MigrateInstallUrlResponse` (GitHub App install address with Studio's signed `state`, and when it expires), with a validator for each side. Requests are signed like the account-state request and keyed by `order_id`; the install-URL validator only lets through GitHub's own App install page.
