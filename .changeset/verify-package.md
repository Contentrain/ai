---
"@contentrain/verify": minor
---

New package: portable SEO, indexing, link and asset gates for a migrated site

A-08. The migration pipeline had a quality audit, but only inside the closed
engine — there was no MIT gate a customer, a CI job, or a community emitter
could run over its own output. This is that gate: 25 checks across identity,
indexing, status, hreflang, structured data, navigation and assets, with a stable
`check` id each, one `passed` boolean, and a CLI that exits non-zero.

**It does not fetch, and that is the design.** A hardened crawler is a security
surface of its own — SSRF, DNS rebinding, redirect limits, byte and time caps —
and it belongs where that hardening is maintained, not inside the MIT library
every consumer embeds. So the package takes documents. The constraint turns out
to be the feature: the same gate runs over a `dist/` directory, over pages a
migration engine already captured, and inside CI, with no network to mock and no
flake. Whoever holds a safe fetcher supplies the pages.

Severity is decided by one rule. `error` means the built site is *wrong* — a
visitor or a crawler gets something it should not. `warning` means it is worse
than the site it replaced. A migration that improves a page must not fail its own
gate.

The checks that justify the package:

- `identity.canonical-mismatch` — a cloned page carrying the template's canonical
  points the whole site at one URL and removes it from the index. Invisible in a
  browser, survives every visual check, worse than having no canonical at all.
- `indexing.noindex` — a staging `noindex` survives the deploy, the site serves
  normally, and it disappears from search over the following weeks.
- `status.soft-404` — a "not found" page answering 200 is invisible to every
  monitor that watches status codes, and a crawler indexes it as content.
- `international.hreflang-not-reciprocal` — search engines ignore one-sided
  alternates entirely, so a half-migrated set is not a partial win.
- `navigation.broken-internal-link` / `assets.broken-image` — resolved through
  one address-identity rule, so `/about`, `/about/` and `/about/index.html` are
  the same page and a path a redirect rule covers is not broken.

Missing inputs are reported, never skipped silently: a run without a baseline, a
sitemap or redirect rules names those absences in `report.skipped`. A green
report over a run that compared nothing is the most dangerous output this package
could produce.

Verified against a real build, not only fixtures: an emitted Astro project was
installed, built, and run through the CLI — it found the planted broken link and
missing image, reported nothing against the emitter's own SEO output, and flagged
`canonical-mismatch` on a duplicated page.

Also registers every published package in the release pre-flight.
`scripts/release-packages.mjs` drives both the metadata check and the tarball
packing, but changesets publishes from the workspace rather than from that list —
so a package missing from it still ships, just unchecked.
`@contentrain/emitter-astro` and `@contentrain/wp-import` had been on npm for
weeks without ever passing the pre-flight. Both are added alongside
`@contentrain/verify`, all three pass, and the file now says that adding a
publishable package means adding it there in the same change.
