---
"@contentrain/types": minor
---

Migrate-Studio account-state answer carries `renewal_cents`: the yearly list price the subscription renews at after the discounted first year (0 when `covers`). Migrate's cart shows it ("then $Y/year") and never computes it. The validator requires it, so an answer from a Studio that predates it is refused.
