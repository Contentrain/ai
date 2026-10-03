---
"@contentrain/types": minor
---

Migrate-Studio account-state answer carries `renewal_cents`: the yearly list price the subscription renews at after the discounted first year (0 when `covers`). Migrate's cart shows it ("then $Y/year") and never computes it. It is optional, so an answer from a Studio that predates it is still accepted; when present it is validated (0 when `covers`, > 0 otherwise).
