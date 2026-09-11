# @contentrain/verify

Portable gates for a migrated site: identity, indexing, status, hreflang,
structured data, navigation and assets — checked over documents you already
have, with no network and no dependencies.

```bash
npx @contentrain/verify dist --site https://example.com
```

## Why it does not fetch

A hardened crawler is a security surface of its own — SSRF, DNS rebinding,
redirect limits, byte and time caps, robots handling — and it belongs where that
hardening is maintained, not inside the MIT library every consumer embeds.

So this package takes documents, and that constraint turns out to be the
feature: the same gate runs over a `dist/` directory, over pages a migration
engine already captured, and inside CI — with no network calls to mock and no
flake. Whoever holds a safe fetcher supplies the pages.

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

Over a built directory:

```ts
import { loadSiteDirectory, verify } from '@contentrain/verify'

const report = verify(await loadSiteDirectory('dist', 'https://example.com'))
```

## Severity

One rule decides it. **error** means the built site is wrong — a visitor or a
crawler gets something it should not. **warning** means it is worse than the
site it replaced, or worse than it should be. A migration that improves a page
must not fail its own gate.

`report.passed` is `counts.error === 0`.

## The checks

### Identity

| Check | Severity | What it catches |
|---|---|---|
| `identity.title-missing` | error | No non-empty `<title>` |
| `identity.title-duplicate` | error | Two titles in the head — a crawler picks one and it is not defined which. A `<title>` inside an inline `<svg>` is an accessibility label and is not counted |
| `identity.canonical-missing` | warning | No canonical link |
| `identity.canonical-duplicate` | error | Two canonicals: the page says two different things about itself |
| `identity.canonical-mismatch` | error | A page carrying another page's canonical |
| `identity.description-missing` | warning | No meta description |
| `identity.open-graph-incomplete` | warning | Missing `og:title` / `og:type` / `og:url` — shares render without a card |
| `identity.twitter-card-missing` | info | No `twitter:card` |

::: danger The clone failure
`canonical-mismatch` is the reason this group exists. A cloned page that kept the
template's canonical points the entire site at one URL and removes it from the
index. It is invisible in a browser, survives every visual check, and is worse
than having no canonical at all.
:::

### Indexing

| Check | Severity | What it catches |
|---|---|---|
| `indexing.noindex` | error | A `noindex` in the robots meta or `X-Robots-Tag` |
| `indexing.sitemap-missing-entry` | warning | An indexable page not in the sitemap. A `noindex` page is not asked to be in it |
| `indexing.sitemap-stale-entry` | warning | The sitemap lists a page the build does not serve |

::: danger The staging leak
A `noindex` set on a staging site survives the deploy, the site builds and
serves normally, and it disappears from search over the following weeks. Nothing
on the page looks wrong.
:::

### Status

| Check | Severity | What it catches |
|---|---|---|
| `status.mismatch` | error | The status changed against the baseline |
| `status.soft-404` | error | A "not found" page answering 200 |
| `status.redirect-chain` | warning | More hops than `maxRedirectHops` (default 1) |
| `status.redirect-loop` | error | A chain that returns to itself |
| `status.redirect-target-missing` | error | An internal redirect pointing at a page the build does not serve |

A soft-404 is invisible to every monitor that watches status codes, and a
crawler indexes it as content. A page is only called one when it *says* it was
not found and is short — the threshold is `soft404MaxTextLength`, so an article
about HTTP 404 is not caught by it.

### International

| Check | Severity | What it catches |
|---|---|---|
| `international.hreflang-not-reciprocal` | error | A names B, B does not name A |
| `international.hreflang-no-self` | warning | A page with alternates that does not list itself |
| `international.hreflang-unknown-target` | warning | An alternate pointing at a page that does not exist |

Search engines ignore one-sided alternates entirely, so a half-migrated set of
alternates is not a partial win — it is nothing.

### Structured data

| Check | Severity | What it catches |
|---|---|---|
| `structured.jsonld-invalid` | error | A block that does not parse — consumers discard the whole block |
| `structured.type-lost` | warning | A `@type` the old page had is gone |

Types nested in `@graph` are counted, which is how themes actually ship them: one
graph holding `Organization`, `WebSite` and `WebPage`.

### Navigation

| Check | Severity | What it catches |
|---|---|---|
| `navigation.broken-internal-link` | error | An internal link that goes nowhere |
| `navigation.pagination-broken` | warning | `rel="next"` / `rel="prev"` pointing at a page the build does not serve |
| `navigation.feed-lost` | warning | The old page advertised a feed and this one does not |

A path a redirect rule covers is not broken. External, `mailto:`, `tel:` and
fragment links are not checked. One finding per distinct href, not per
occurrence — a broken link in a shared header is one problem, not one per page
element.

### Assets

| Check | Severity | What it catches |
|---|---|---|
| `assets.broken-image` | error | An internal image resolving to nothing the build serves |
| `assets.missing-alt` | warning | An `<img>` with no `alt` attribute |
| `assets.alt-lost` | warning | Alt text the old page had for the same image is gone |

`alt=""` is a decision (the image is decorative) and is not reported; no `alt`
attribute at all is an omission and is. `data:` URIs and third-party hosts are
skipped.

## Address identity

Every "does this go somewhere that exists" question is a normalisation question,
and getting it wrong in either direction is worse than not asking: too strict and
a correct site fails its gate, too loose and a broken one passes.

- `/about`, `/about/` and `/about/index.html` are one address, because static
  hosts serve them that way.
- Query strings and fragments are not part of a document's identity.
- Case is preserved, because static hosts are case-sensitive even when the
  author assumed otherwise.

Without `site`, relative links still resolve (against a reserved origin) and
absolute links to real hosts count as external. Supplying `site` is better: it is
what makes `canonical-mismatch` and the cross-origin checks exact.

## Missing inputs are reported, not skipped silently

A run without a baseline, a sitemap or redirect rules names those absences in
`report.skipped`. A green report over a run that compared nothing is the most
dangerous output this package could produce.

```
SKIPPED status — no baseline — parity checks did not run
SKIPPED indexing — no sitemap — membership checks did not run
```

## CLI

```
contentrain-verify <dist-dir> [options]

  --site <url>          Canonical origin
  --baseline <dir>      The old site, as a directory of captured pages
  --redirects <file>    JSON: [{ "from": "/a", "to": "/b", "status": 301 }]
  --groups <list>       identity,indexing,status,international,structured,navigation,assets
  --max-redirect-hops <n>
  --json
```

Exits 1 when any finding is an error, 2 on a usage error. Unknown options and
unknown group names are rejected rather than ignored.

## Reading HTML

Targeted regexes, not a parser — the same choice
[`@contentrain/emitter-astro`](https://github.com/Contentrain/ai/tree/main/packages/emitter-astro)
makes, for the same reason: these are machine-generated documents whose head the
pipeline controls, the extracted set is small and fixed, and a parser would put a
dependency into the one package a migration should be able to run anywhere.

The limits are honoured rather than papered over. Attribute reads require
whitespace before the name, so `data-src` never answers a read of `src` — which
matters, because lazy-loading WordPress themes put the real URL in `data-src` on
almost every image. Where a check would be wrong under these limits, it is not
written.

## Related Pages

- [Types](/packages/types) — the shared contracts
- [Query SDK](/packages/sdk)
- [MCP Tools](/packages/mcp)
