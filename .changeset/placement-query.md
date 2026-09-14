---
"@contentrain/types": minor
"@contentrain/emitter-astro": minor
---

A page region can be bound to a query instead of frozen as a clone

A theme's "recent posts" block sits in the chrome of every article. Cloned, it
freezes on the day of the migration: it keeps listing the same posts forever and
nobody notices, because it still looks right. Measured across a blind cohort,
nine post families across eight sites carried one.

`ComponentPlacement.query` names a `QueryBinding`, and the emitter fills that
region from the query's results — the difference between a copy of a site and a
site, because the block stays current *and* becomes editable.

On the placement rather than on `ComponentDef`, because it is a per-mount fact:
one `related` component can be mounted by a post family filtered to the post's
category and by an author family filtered to the author. The definition says
what the region *is*; the placement says what it shows here — the same split
`variant` and `selector` already follow.

**The layout resolves the data, not the component.** A component file is shared
by id across families while a placement belongs to one, so two families binding
the same component to different queries could not both be served by a single
file. The layout imports the query, renders it, and passes the markup to the
mount; the component keeps a `html` prop and its placeholder to fall back to, so
the region stays editable in one place while staying current from another.

Exactly one result set is expected. A list *page* maps each to a route; a region
has no route parameter to choose between them, so more than one is a build error
rather than a guess — picking the first would silently render one category's
posts under every category. The emitter warns at emit time and the generated
`renderQuery` throws at build time.

A binding whose query is not in `input.content.queries` is dropped with a
warning and the region stays the cloned markup, rather than emitting an import
of a data file nobody wrote.
