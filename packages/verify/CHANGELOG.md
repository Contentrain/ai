# @contentrain/verify

## 0.2.0

### Minor Changes

- 3293a9e: Three gates a migrated site actually fails on, and the 404-page exemption they uncovered

  Requested by the migration engine after comparing this check set against its own
  quality oracle. The two sets turned out to be complementary rather than
  overlapping — the oracle asks "does it look the same and does the content come
  from data", this asks "is it technically wrong" — and these three were the gaps
  on this side.

  - **`status.not-found-page-missing`** (error) — the build has no `404.html`.
    Across a blind cohort of nineteen migrated sites, none had one. Migrated
    navigation is root-relative, so a wrong path is not a rare event, and without
    a 404 page the visitor lands on the host's generic page with none of the
    site's chrome and no way back. Only checked when `input.build` says the
    documents are a build directory: a set of pages captured from a running site
    cannot show one, and asserting it there would report a defect the input cannot
    express.
  - **`assets.source-origin-reference`** (error) — a reference to
    `options.sourceOrigin`, the host the content was migrated away from. Measured
    across the same cohort this was the single largest thing keeping sites from
    being deliverable: sixteen of nineteen carried them, 1,491 in total. A page
    that still points at the old host has not been migrated, it has been mirrored
    — the new site works only while the old one stays up. `options.allowHosts`
    exempts a CDN the customer kept.
  - **`identity.lang-missing`** (warning) — no `lang` on `<html>`.

  Two input fields come with them. `input.build` marks documents as a build
  directory. `input.files` carries the contents of stylesheets and scripts, which
  `assets.source-origin-reference` scans: a `url()` pointing at the old host is
  exactly as fatal as one in the HTML, and a scan that silently skips CSS reports
  a smaller number than the truth — which is worse than not counting at all when
  two tools compare figures. The report says which of the two it did.
  `loadSiteDirectory` sets both.

  **The 404 page is now exempt from the checks that assume an address.** Writing
  the first of these surfaced a false positive that was already there: a static
  host hands `404.html` to a visitor who asked for something else, so it is not
  served at its own address — and a correct 404 page says "not found" and is
  short, which is exactly the shape `status.soft-404` looks for. Every site that
  had done the right thing would have failed on it. `identity.canonical-*` and
  `indexing.sitemap-missing-entry` are exempt for the same reason. Recognised at
  either spelling a build produces: `404.html` or `404/index.html`.

  CLI gains `--source-origin <host>` and `--allow-host <host>` (repeatable).

## 0.1.0

### Minor Changes

- 5c2acc0: New package: portable SEO, indexing, link and asset gates for a migrated site

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

  Severity is decided by one rule. `error` means the built site is _wrong_ — a
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
