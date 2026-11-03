---
"@contentrain/types": minor
---

Migrate with Studio can be collected by Migrate. `billing.collector` (`studio_polar` | `migrate`) on the v2 claim says who takes the one payment.

When Migrate collects:
- Studio answers `MigrateProvisionReserved`, with the reserved Studio line and no checkout.
- Migrate reports the payment with the new `MigrateGrantActivateRequest` / `MigrateGrantActivateResponse` (`grants/activate`).
- Studio starts a prepaid year of `MIGRATE_PREPAID_YEAR_SECONDS` from `paid_at`.

Validators and status:
- `validateMigrateProvisionResponse` takes `collector` and `migrate_fee_cents`, and fails closed on the wrong answer shape.
- The grant status gains `renewal: none | scheduled` (bundle only).
- The revoke reasons gain `studio_not_delivered`.

Absent `collector` keeps the Polar checkout unchanged.
