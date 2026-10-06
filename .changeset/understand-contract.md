---
'@contentrain/types': minor
---

New understand contract for Migrate's render-first pipeline: `Band` (a measured horizontal band of a template's page, with `MeasuredStyle` and a node range), `RegionSpec` (what a band is — `Archetype`, confidence — and which outline nodes hold its content, as `SlotRef`s; never the content itself), `Fidelity` and `UnderstandRun` with a per-call ledger. The slot vocabulary is exported as data (`REGION_SLOT_DEFS`, `REGION_ITEM_SLOT_DEFS`, `REGION_GROUP_SLOT_DEFS`). `validateBands` and `validateRegionSpecs` are the pure gates between the stages: a slot outside the vocabulary, a ref outside its band or a node that holds nothing of the slot's kind is an issue, not a silent drop. `forEachSlot`, `regionId` and `needsFallback` are the shared helpers. Source- and target-neutral: source-specific signals travel only in `Band.hints`. Additive.
