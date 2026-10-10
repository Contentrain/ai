---
"@contentrain/astro-kit": minor
---

A popup opened from the page's content opens the migrated `Dialog`, with no button of its own.
- `Dialog` takes `triggerStyle: "none"`: no button and no section band. A link to `#<id>` anywhere on the page opens it (marked `aria-haspopup="dialog"`, with no jump). So do a `commandfor` button where the browser has no Invoker Commands, and an address that arrives with `#<id>`. With scripting off, its content is laid out in place and the `#<id>` link jumps to it.
- A behaviour island's own closed `<dialog>` is opened by its `aria-controls` opener as a modal. A close button is added where it has none. This works in an island of any kind, even where that island's own wiring failed. Before, it stayed hidden.
- With scripting off, a closed `<dialog>` in an island is shown in place.
