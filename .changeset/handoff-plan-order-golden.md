---
"@contentrain/types": minor
---

`MigrationHandoff` carries `plan_hash` and `order_id` (both optional; the contract version stays 1), so a reader can tie a handoff to the delivery it was written for and notice a stale one. The golden handoff Migrate writes at delivery is published as `MIGRATION_HANDOFF_GOLDEN`, typed against `MigrationHandoff`: the producer's test and Studio's test read the same document instead of each keeping a copy.
