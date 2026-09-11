# @contentrain/verify

Portable gates for a migrated site: identity, indexing, status, hreflang,
structured data, navigation and assets — checked over documents you already
have, with no network and no dependencies.

MIT. Part of the [Contentrain](https://contentrain.io) migration pipeline, and
usable on its own against any static build.

```bash
npx @contentrain/verify dist --site https://example.com
```

## Why it does not fetch

A hardened crawler is a security surface of its own — SSRF, DNS rebinding,
redirect limits, byte and time caps, robots handling — and it belongs where that
hardening is maintained, not inside the MIT library every consumer embeds.

So this package takes documents. That constraint turns out to be the feature:
the same gate runs over a `dist/` directory, over pages a migration engine
already captured, and inside CI, with no network calls to mock and no flake.
Whoever holds a safe fetcher supplies the pages.

## Usage

```ts
import { verify, formatReport } from '@contentrain/verify'

const report = verify({
  site: 'https://example.com',
  documents: [{ url: '/about', html, status: 200, headers }],
  assets: ['/img/hero.png'],
  sitemap: sitemapXml,
  redirects: [{ from: '/old', to: '/about', status: 301 }],
  baseline: { documents: oldPages },   // optional: enables the parity checks
})

report.passed        // no error findings — this is the gate
report.findings      // every finding, with a stable `check` id
report.skipped       // what could not run, and why
console.log(formatReport(report))
```

Or over a built directory:

```ts
import { loadSiteDirectory, verify } from '@contentrain/verify'

const report = verify(await loadSiteDirectory('dist', 'https://example.com'))
```

## The checks

Severity is decided by one rule: **error** means the built site is wrong — a
visitor or a crawler gets something it should not. **warning** means it is worse
than the site it replaced, or worse than it should be. A migration that improves
a page must not fail its own gate.

| Group | Check | Severity | What it catches |
|---|---|---|---|
| identity | `identity.title-missing` | error | No non-empty `<title>` |
| | `identity.title-duplicate` | error | Two titles in the head — a crawler picks one, undefined which. A `<title>` inside an inline `<svg>` is an accessibility label and is not counted |
| | `identity.canonical-missing` | warning | No canonical link |
| | `identity.canonical-duplicate` | error | Two canonicals: the page says two things about itself |
| | `identity.canonical-mismatch` | error | **The clone failure.** A page carrying the template's canonical points the whole site at one URL and removes it from the index. Invisible in a browser, worse than having no canonical |
| | `identity.description-missing` | warning | No meta description |
| | `identity.open-graph-incomplete` | warning | Missing `og:title` / `og:type` / `og:url` — shares render without a card |
| | `identity.twitter-card-missing` | info | No `twitter:card` |
| identity | `identity.lang-missing` | warning | No `lang` on `<html>` — what a screen reader picks a voice from |
| indexing | `indexing.noindex` | error | **The staging leak.** A `noindex` in the meta or `X-Robots-Tag` survives deploy and the site disappears from search over the following weeks |
| | `indexing.sitemap-missing-entry` | warning | An indexable page is not in the sitemap (a `noindex` page is not asked to be) |
| | `indexing.sitemap-stale-entry` | warning | The sitemap lists a page the build does not serve |
| status | `status.mismatch` | error | The status changed against the baseline |
| | `status.soft-404` | error | A "not found" page answering 200 — invisible to every status monitor, indexed as content |
| | `status.redirect-chain` | warning | More hops than `maxRedirectHops` (default 1) |
| | `status.redirect-loop` | error | A chain that returns to itself |
| | `status.redirect-target-missing` | error | An internal redirect pointing at a page the build does not serve |
| | `status.not-found-page-missing` | error | The build has no `404.html`. Only checked for a build (`input.build`); migrated navigation is root-relative, so a wrong path is not rare, and without one the visitor lands on the host's page with none of the site's chrome |
| international | `international.hreflang-not-reciprocal` | error | A names B but B does not name A. Search engines ignore one-sided alternates entirely, so half the work is worth nothing |
| | `international.hreflang-no-self` | warning | A page with alternates that does not list itself |
| | `international.hreflang-unknown-target` | warning | An alternate pointing at a page that does not exist |
| structured | `structured.jsonld-invalid` | error | A JSON-LD block that does not parse — consumers discard the whole block |
| | `structured.type-lost` | warning | A `@type` the old page had is gone. Types inside `@graph` are counted, which is how themes actually ship them |
| navigation | `navigation.broken-internal-link` | error | An internal link that goes nowhere. A path a redirect rule covers is fine; external, `mailto:`, `tel:` and fragment links are not checked |
| | `navigation.pagination-broken` | warning | `rel="next"` / `rel="prev"` pointing at a page the build does not serve |
| | `navigation.feed-lost` | warning | The old page advertised a feed and this one does not |
| assets | `assets.broken-image` | error | An internal image that resolves to nothing the build serves. `data:` URIs and third-party hosts are skipped |
| | `assets.missing-alt` | warning | An `<img>` with no `alt` attribute. `alt=""` is a decision (decorative) and is not reported |
| | `assets.alt-lost` | warning | Alt text the old page had for the same image is gone |
| | `assets.source-origin-reference` | error | A reference to `options.sourceOrigin` — the host the content was migrated away from. The new site then works only while the old one stays up. Scans documents, and stylesheets and scripts when `input.files` carries their contents; `options.allowHosts` exempts a CDN the customer kept |

## The 404 page

A static host hands `404.html` to a visitor who asked for something else, so it
is not served at its own address and the checks that assume otherwise do not
apply to it: canonical, sitemap membership, and — the one that matters —
soft-404. A correct 404 page says "not found" and is short, which is exactly the
shape the soft-404 check looks for, so without this exemption every site that
did the right thing would fail on it.

Recognised at either spelling a build produces: `404.html` at the root, or
`404/index.html`.

## Address identity

Every "does this go somewhere that exists" question is a normalisation question,
and getting it wrong in either direction is worse than not asking: too strict and
a correct site fails, too loose and a broken one passes.

- `/about`, `/about/` and `/about/index.html` are one address, because static
  hosts serve them that way.
- Query strings and fragments are not part of a document's identity.
- Case is preserved, because static hosts are case-sensitive even when the
  author assumed otherwise.

Without `site`, relative links still resolve (against a reserved origin) and
absolute links to real hosts are treated as external. Supplying `site` is better:
it is what makes `canonical-mismatch` and cross-origin checks exact.

## What a missing input does

Nothing is silently skipped. A run without a baseline, a sitemap or redirect
rules reports those absences in `report.skipped` — a green report over a run that
compared nothing is the most dangerous output this package could produce.

## CLI

```
contentrain-verify <dist-dir> [options]

  --site <url>          Canonical origin
  --baseline <dir>      The old site, as a directory of captured pages
  --redirects <file>    JSON: [{ "from": "/a", "to": "/b", "status": 301 }]
  --source-origin <host>  The old host content was migrated away from
  --allow-host <host>     A host that may still be referenced (repeatable)
  --groups <list>       identity,indexing,status,international,structured,navigation,assets
  --max-redirect-hops <n>
  --json
```

Exits 1 when any finding is an error, 2 on a usage error. Unknown options and
unknown group names are rejected rather than ignored.

## Reading HTML

Targeted regexes, not a parser — the same choice `@contentrain/emitter-astro`
makes, for the same reason: these are machine-generated documents whose head the
pipeline controls, the extracted set is small and fixed, and a parser would put a
dependency into the one package a migration should be able to run anywhere.

The limits are honoured rather than papered over. Attribute reads require
whitespace before the name, so `data-src` never answers a read of `src` — which
matters, because lazy-loading WordPress themes put the real URL in `data-src` on
almost every image. Where a check would be wrong under these limits, it is not
written.

## Related

- [`@contentrain/emitter-astro`](../emitter-astro) — produces the site this verifies
- [`@contentrain/wp-import`](../wp-import) — produces the content
- [`@contentrain/types`](../types) — the shared contracts

## License

MIT
