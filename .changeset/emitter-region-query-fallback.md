---
"@contentrain/emitter-astro": patch
---

A region bound to a query whose result set has no `item_template` or `sections` rendered an empty string, with no warning: the block disappeared from every page. It now renders the same plain list of links a list page falls back to, and the emitter warns, as `QueryPage.item_template` documents. List pages and regions render a result set through one runtime function (`renderQueryPage`), so they cannot drift apart again. An empty `sections` array no longer hides an `item_template` next to it.
