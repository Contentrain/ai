---
"@contentrain/types": minor
"@contentrain/emitter-astro": minor
---

List sections, page titles, and per-route language.

- **List sections** (`QueryPage.sections`, `LIST_ITEMS_SLOT`): a list renders as a sequence of blocks — a big card in its own wrapper, then a grid — each with its own template and item count. One template per list forced every item into the big-card shape (a measured category page scored 56), and baking the big card into the chrome puts the wrong post on page 2. `item_template` remains the single-section shorthand, and a sectioned list no longer triggers the fallback warning.
- **Page titles** (`QueryPage.title`, `RouteModel.title`): archive, paginated and static pages emit a real `<title>` instead of an empty one.
- **Per-route language** (`RouteModel.locale`, `QueryBinding.locale`, `EmitPost.locale`): the emitted layout takes `lang` as a prop and each route passes its own, so a multilingual site is a route + family + query per language instead of a second collection workaround.
