---
"@contentrain/types": minor
---

An item's `text` slot takes one ref or a list of the item's blocks in order (`RegionItem.text: SlotRef | SlotRef[]`), so the engine can fold a card's further paragraphs into the item. Widening only: a single ref validates as before, and `REGION_ITEM_SLOT_DEFS.text` keeps `many: false` with a new `list: true` flag (`RegionSlotDef.list`), so a prompt rendered from `kind`/`many` is byte-identical. A one-ref slot without `list` still refuses a list (`bad_slot`).
