---
"@contentrain/emitter-astro": minor
---

A route collision fails the build instead of silently dropping a section of the site

WordPress serves posts and pages from the same root and tells them apart in the
database. A static generator cannot, so a posts route at `/:slug*` and a pages
family at `/:slug*` resolve to one Astro file. The emitter kept the first and
warned `duplicate file with different content: src/pages/[...slug].astro —
keeping the first`.

Two things were wrong with that. Every page of the second route disappeared, and
the message named a *file*, so a producer learned a path had been written twice
rather than that a section of its site was missing. On one measured site the
pages were being rendered by the post template and scoring below zero, and the
warning did not match the run gate's `route … skipped` pattern, so nothing
caught it.

Now a second claim on a page path is reported as what it is — `route r-pages:
pattern "/:slug*" emits the same Astro page as route r-posts ("/:slug*") —
src/pages/[...slug].astro. Every page of "r-pages" would be dropped …` — and
that page is replaced with a guard carrying the same message, so `astro build`
stops. The pages are unrecoverable either way: the emitter cannot know which
route should own the path. A build that stops is recoverable; a site that
quietly lost its pages is not.

The guard throws from `getStaticPaths` on a dynamic path, because Astro collects
paths before it renders and a frontmatter throw would never run — the build
would fail on the missing `getStaticPaths` with Astro's generic message instead
of the one naming the two routes. On a static path it throws from the
frontmatter, because exporting `getStaticPaths` there is itself an error.

A collision counts even when both routes would render the same family and
collection: Astro serves one file per path, so one of the two routes does not
exist in the built site and which one survived is an accident of ordering. The
generic `duplicate file` warning no longer fires for `src/pages/**`, where it
would only bury the specific one.

Verified end to end: a generated project with two `/:slug*` routes fails
`astro build` with exit code 1 and the collision message verbatim.
