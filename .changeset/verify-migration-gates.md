---
"@contentrain/verify": minor
---

Three gates a migrated site actually fails on, and the 404-page exemption they uncovered

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
