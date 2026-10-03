---
"@contentrain/types": minor
---

Project plans can carry two more details of the source's query lists. `moreIncludesCurrent` (on `site.post` and on each `site.entryLayouts` entry) says the "more posts" list also shows the post being read, as the source's `core/query` does; absent, the current post is left out as before. `site.lists.tone: 'muted'` says the source sets the theme's muted text colour on the list itself (titles keep their own colour). `validateProjectPlan` checks all three.

The astro starter reads them: the post and entry views keep the current entry in the list when told to, and the list roots take the muted text colour.
