---
"@contentrain/types": minor
---

`SourceInventory` / `SourceInventoryRecord`: the per-record origin inventory a `bridge_inventory` cursor's `inventory_hash` identifies. Deletions and moves are proven by comparing two inventories; `modified_after` only narrows which bodies to fetch again. Records are keyed by `wp_type` + `wp_id`, and `updated` is decided on the record's `fingerprint`, because a meta-only WordPress edit leaves the modified date alone.

`SourceDeltaEntry` gains optional `path_before` / `path_after` — a page that changed parent, a renamed term base or a dated permalink moves without a slug change, and redirects are generated from the path — and `deleted_kind` (`trashed` / `purged`). `SourceDeltaPlan` gains optional `deletions_undetectable_types` for origin types that left the scope. All additions are optional; existing plans stay valid.
