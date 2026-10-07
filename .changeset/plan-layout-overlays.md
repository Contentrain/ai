---
'@contentrain/types': minor
---

A project plan can now place what the source draws over every page, apart from its header and footer, such as a popup from Elementor Popup or Popup Maker. These go in `layout.overlays`, a list of placements in source order, each bound to its own singleton. `validateProjectPlan` checks each one as it checks the header and footer, reporting problems as `layout overlay <n>`. The starter renders them after the footer, from `src/views/overlays/index.ts`.
