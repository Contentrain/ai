// ─── The gates ───
//
// Seven groups, from the migration contract's verification scope. Each check
// has a stable id and answers one question; none of them fetches anything.
//
// Two rules shaped every check below. A finding is an `error` only when the
// built site is *wrong* — a visitor or a crawler gets something it should not.
// Everything that is merely worse than the old site is a `warning`, because a
// migration that improves a page should not fail its own gate.

import type { Finding, VerifyDocument, VerifyInput, VerifyOptions } from './types.js'
import {
  anchors, images, jsonLd, jsonLdTypes, linksRel, metaMap, sitemapLocations, text, titles,
} from './html.js'
import { absolute, identity, isInternal, resolve } from './url.js'

export interface Context {
  input: VerifyInput
  options: Required<Pick<VerifyOptions, 'maxRedirectHops' | 'soft404MaxTextLength'>> & VerifyOptions
  /** Document identity → document, for the built site. */
  byIdentity: Map<string, VerifyDocument>
  /** Baseline document identity → document. */
  baselineByIdentity: Map<string, VerifyDocument>
  /** Identities of everything the build serves: documents plus assets. */
  served: Set<string>
}

const NOT_FOUND_TEXT = /\b(404|not found|page not found|sayfa bulunamad[ıi]|nicht gefunden|introuvable|no se encontr)/i

/**
 * The build's 404 page, which is not served at its own address.
 *
 * A static host hands this document to a visitor who asked for something else,
 * so every check that assumes "this document is served at this URL" is wrong
 * about it: its canonical does not describe a page, it does not belong in the
 * sitemap, and — the one that matters — it says "not found" and is short by
 * design, which is precisely the shape of a soft-404. Without this exemption
 * every correctly built site would fail on having done the right thing.
 */
function isNotFoundDocument(doc: VerifyDocument, ctx: Context): boolean {
  const id = identity(doc.url, ctx.input.site)
  return id === '/404' || id === '/404.html'
}

function finding(f: Finding): Finding {
  return f
}

// ─── identity ───

export function identityChecks(doc: VerifyDocument, ctx: Context): Finding[] {
  const out: Finding[] = []
  const url = doc.url
  const group = 'identity' as const
  const found = titles(doc.html)

  if (found.every(t => t === '')) {
    out.push(finding({ group, check: 'identity.title-missing', severity: 'error', url, message: 'No non-empty <title> in the head.' }))
  } else if (found.length > 1) {
    out.push(finding({
      group,
      check: 'identity.title-duplicate',
      severity: 'error',
      url,
      message: `${found.length} <title> elements in the head — a crawler takes one and it is not defined which.`,
      detail: found.join(' | '),
    }))
  }

  const meta = metaMap(doc.html)
  const description = meta.get('description')?.[0]?.trim()
  if (!description) {
    out.push(finding({ group, check: 'identity.description-missing', severity: 'warning', url, message: 'No meta description.' }))
  }

  const canonicals = linksRel(doc.html, 'canonical')
  if (isNotFoundDocument(doc, ctx)) {
    // No address of its own, so nothing to be canonical about.
  } else if (canonicals.length === 0) {
    out.push(finding({ group, check: 'identity.canonical-missing', severity: 'warning', url, message: 'No canonical link.' }))
  } else if (canonicals.length > 1) {
    out.push(finding({
      group,
      check: 'identity.canonical-duplicate',
      severity: 'error',
      url,
      message: `${canonicals.length} canonical links — the page tells crawlers two different things about itself.`,
      detail: canonicals.map(c => c.href).join(' | '),
    }))
  } else {
    // The failure this catches is a template's canonical surviving a clone:
    // every page canonicalises to one URL and the site removes itself from the
    // index. It is worse than having no canonical at all.
    const declared = resolve(canonicals[0]!.href, url, ctx.input.site)
    const self = absolute(url, ctx.input.site) ?? resolve(url, '/', ctx.input.site)
    if (declared && self && identity(declared, ctx.input.site) !== identity(self, ctx.input.site)) {
      out.push(finding({
        group,
        check: 'identity.canonical-mismatch',
        severity: 'error',
        url,
        message: 'Canonical points at a different page.',
        detail: `${canonicals[0]!.href} ≠ ${url}`,
      }))
    }
  }

  // `<html lang>` is what a screen reader picks a voice from and what a
  // translation prompt keys on. A migrated page that lost it is not visibly
  // broken, which is why it stays lost.
  if (!/<html\b[^>]*\slang\s*=\s*["']?[a-zA-Z]/.test(doc.html)) {
    out.push(finding({ group, check: 'identity.lang-missing', severity: 'warning', url, message: 'No lang attribute on <html>.' }))
  }

  const missingOg = ['og:title', 'og:type', 'og:url'].filter(key => !meta.get(key)?.[0])
  if (missingOg.length) {
    out.push(finding({
      group,
      check: 'identity.open-graph-incomplete',
      severity: 'warning',
      url,
      message: `Open Graph incomplete — missing ${missingOg.join(', ')}. Shares render without a card.`,
    }))
  }
  if (!meta.get('twitter:card')?.[0]) {
    out.push(finding({ group, check: 'identity.twitter-card-missing', severity: 'info', url, message: 'No twitter:card.' }))
  }

  return out
}

// ─── indexing ───

/** `noindex` as declared by a robots meta or an X-Robots-Tag header. */
function noindexReason(doc: VerifyDocument): string | undefined {
  const robots = metaMap(doc.html).get('robots')?.join(',') ?? ''
  if (/\bnoindex\b/i.test(robots)) return `<meta name="robots" content="${robots}">`
  const header = doc.headers?.['x-robots-tag'] ?? ''
  if (/\bnoindex\b/i.test(header)) return `X-Robots-Tag: ${header}`
  return undefined
}

export function indexingChecks(doc: VerifyDocument, ctx: Context): Finding[] {
  const out: Finding[] = []
  const group = 'indexing' as const
  const url = doc.url

  // A staging `noindex` carried into production is silent: the site builds,
  // deploys, serves — and disappears from search over the following weeks.
  const reason = noindexReason(doc)
  if (reason) {
    out.push(finding({ group, check: 'indexing.noindex', severity: 'error', url, message: 'Page is marked noindex.', detail: reason }))
  }

  if (ctx.input.sitemap !== undefined) {
    const listed = new Set(sitemapLocations(ctx.input.sitemap).map(loc => identity(loc, ctx.input.site)))
    if (!listed.has(identity(url, ctx.input.site)) && !reason && !isNotFoundDocument(doc, ctx)) {
      out.push(finding({ group, check: 'indexing.sitemap-missing-entry', severity: 'warning', url, message: 'Indexable page is not in the sitemap.' }))
    }
  }

  return out
}

/** Sitemap entries pointing at pages the build does not serve. */
export function sitemapStaleChecks(ctx: Context): Finding[] {
  if (ctx.input.sitemap === undefined) return []
  const out: Finding[] = []
  for (const loc of sitemapLocations(ctx.input.sitemap)) {
    const id = identity(loc, ctx.input.site)
    if (ctx.byIdentity.has(id)) continue
    out.push(finding({
      group: 'indexing',
      check: 'indexing.sitemap-stale-entry',
      severity: 'warning',
      url: loc,
      message: 'Sitemap lists a page the build does not serve.',
    }))
  }
  return out
}

// ─── status ───

export function statusChecks(doc: VerifyDocument, ctx: Context): Finding[] {
  const out: Finding[] = []
  const group = 'status' as const
  const url = doc.url
  const status = doc.status ?? 200

  const before = ctx.baselineByIdentity.get(identity(url, ctx.input.site))
  if (before) {
    const was = before.status ?? 200
    if (was !== status) {
      out.push(finding({
        group,
        check: 'status.mismatch',
        severity: 'error',
        url,
        message: `Status changed: ${was} → ${status}.`,
      }))
    }
  }

  // A "not found" page answering 200 is invisible to every monitor that looks
  // at status codes, and a crawler indexes it as content.
  if (status === 200) {
    const bodyText = text(doc.html)
    const title = titles(doc.html)[0] ?? ''
    const saysNotFound = NOT_FOUND_TEXT.test(title) || NOT_FOUND_TEXT.test(bodyText.slice(0, 400))
    if (saysNotFound && bodyText.length <= ctx.options.soft404MaxTextLength && !isNotFoundDocument(doc, ctx)) {
      out.push(finding({
        group,
        check: 'status.soft-404',
        severity: 'error',
        url,
        message: 'Page says it was not found but answers 200.',
        detail: title || bodyText.slice(0, 120),
      }))
    }
  }

  return out
}

/**
 * A build with no `404.html`.
 *
 * Only meaningful for a build: a set of pages captured from a running site
 * cannot show one, so asserting it there would report a defect the input cannot
 * express. Measured across a blind cohort every site lacked one — and because
 * migrated navigation is root-relative, a wrong path is not a rare event: it
 * lands the visitor on the host's generic page, with none of the site's chrome
 * and no way back.
 */
export function notFoundPageChecks(ctx: Context): Finding[] {
  if (!ctx.input.build) return []
  // Both spellings a static build produces: Astro writes `404.html` at the
  // root, and a directory-style build writes `404/index.html`, which the
  // address rule reduces to `/404`.
  const served = ctx.input.documents.some((doc) => {
    const id = identity(doc.url, ctx.input.site)
    return id === '/404' || id === '/404.html'
  })
  if (served) return []
  return [finding({
    group: 'status',
    check: 'status.not-found-page-missing',
    severity: 'error',
    message: 'The build has no 404.html, so a wrong path lands on the host\u2019s page instead of the site\u2019s.',
  })]
}

/** Redirect rules: chains, loops, and targets that do not exist. */
export function redirectChecks(ctx: Context): Finding[] {
  const rules = ctx.input.redirects
  if (!rules?.length) return []
  const out: Finding[] = []
  const group = 'status' as const
  const byFrom = new Map(rules.map(rule => [identity(rule.from, ctx.input.site), rule]))

  for (const rule of rules) {
    const seen = new Set<string>([identity(rule.from, ctx.input.site)])
    let hops = 1
    let target = identity(rule.to, ctx.input.site)

    while (byFrom.has(target)) {
      if (seen.has(target)) {
        out.push(finding({
          group,
          check: 'status.redirect-loop',
          severity: 'error',
          url: rule.from,
          message: 'Redirect chain loops.',
          detail: [...seen, target].join(' → '),
        }))
        break
      }
      seen.add(target)
      target = identity(byFrom.get(target)!.to, ctx.input.site)
      hops += 1
    }

    if (hops > ctx.options.maxRedirectHops) {
      out.push(finding({
        group,
        check: 'status.redirect-chain',
        severity: 'warning',
        url: rule.from,
        message: `Redirect chain is ${hops} hops.`,
        detail: [...seen, target].join(' → '),
      }))
    }

    const external = !isInternal(resolve(rule.to, rule.from, ctx.input.site) ?? '', ctx.input.site, ctx.options.internalHosts)
    if (!external && !ctx.served.has(target) && !byFrom.has(target)) {
      out.push(finding({
        group,
        check: 'status.redirect-target-missing',
        severity: 'error',
        url: rule.from,
        message: 'Redirect points at a page the build does not serve.',
        detail: rule.to,
      }))
    }
  }

  return out
}

// ─── international ───

/**
 * hreflang has to be symmetric: if A offers B as its Turkish alternate, B must
 * offer A back. A one-sided declaration is ignored by search engines entirely,
 * so a half-migrated set of alternates is not a partial win — it is nothing.
 */
export function internationalChecks(ctx: Context): Finding[] {
  const out: Finding[] = []
  const group = 'international' as const
  const declared = new Map<string, Map<string, string>>()

  for (const doc of ctx.input.documents) {
    const self = identity(doc.url, ctx.input.site)
    const alternates = new Map<string, string>()
    for (const link of linksRel(doc.html, 'alternate')) {
      if (!link.hreflang) continue
      const target = resolve(link.href, doc.url, ctx.input.site)
      if (!target) continue
      alternates.set(link.hreflang.toLowerCase(), identity(target, ctx.input.site))
    }
    if (alternates.size) declared.set(self, alternates)
  }

  for (const [self, alternates] of declared) {
    const listsSelf = [...alternates.values()].includes(self)
    if (!listsSelf) {
      out.push(finding({
        group,
        check: 'international.hreflang-no-self',
        severity: 'warning',
        url: self,
        message: 'Page declares hreflang alternates but does not list itself.',
      }))
    }
    for (const [lang, target] of alternates) {
      if (target === self) continue
      if (!ctx.byIdentity.has(target)) {
        out.push(finding({
          group,
          check: 'international.hreflang-unknown-target',
          severity: 'warning',
          url: self,
          message: `hreflang="${lang}" points at a page the build does not serve.`,
          detail: target,
        }))
        continue
      }
      const back = declared.get(target)
      if (!back || ![...back.values()].includes(self)) {
        out.push(finding({
          group,
          check: 'international.hreflang-not-reciprocal',
          severity: 'error',
          url: self,
          message: `hreflang="${lang}" names ${target}, which does not name it back — search engines ignore one-sided alternates.`,
        }))
      }
    }
  }

  return out
}

// ─── structured data ───

export function structuredChecks(doc: VerifyDocument, ctx: Context): Finding[] {
  const out: Finding[] = []
  const group = 'structured' as const
  const url = doc.url
  const blocks = jsonLd(doc.html)

  for (const block of blocks) {
    if (block.value === undefined) {
      out.push(finding({
        group,
        check: 'structured.jsonld-invalid',
        severity: 'error',
        url,
        message: 'A JSON-LD block does not parse — the whole block is discarded by consumers.',
        detail: block.raw.slice(0, 120),
      }))
    }
  }

  const before = ctx.baselineByIdentity.get(identity(url, ctx.input.site))
  if (!before) return out

  const had = new Set(jsonLd(before.html).flatMap(block => jsonLdTypes(block.value)))
  const has = new Set(blocks.flatMap(block => jsonLdTypes(block.value)))
  const lost = [...had].filter(type => !has.has(type))
  if (lost.length) {
    out.push(finding({
      group,
      check: 'structured.type-lost',
      severity: 'warning',
      url,
      message: `Structured data types the old page had are gone: ${lost.join(', ')}.`,
    }))
  }

  return out
}

// ─── navigation ───

export function navigationChecks(doc: VerifyDocument, ctx: Context): Finding[] {
  const out: Finding[] = []
  const group = 'navigation' as const
  const url = doc.url
  const redirected = new Set((ctx.input.redirects ?? []).map(rule => identity(rule.from, ctx.input.site)))

  const broken = new Set<string>()
  for (const href of anchors(doc.html)) {
    if (/^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue
    const target = resolve(href, url, ctx.input.site)
    if (!target || !isInternal(target, ctx.input.site, ctx.options.internalHosts)) continue
    const id = identity(target, ctx.input.site)
    if (ctx.served.has(id) || redirected.has(id)) continue
    broken.add(href)
  }
  for (const href of broken) {
    out.push(finding({ group, check: 'navigation.broken-internal-link', severity: 'error', url, message: 'Internal link goes nowhere.', detail: href }))
  }

  for (const token of ['next', 'prev'] as const) {
    for (const link of linksRel(doc.html, token)) {
      const target = resolve(link.href, url, ctx.input.site)
      if (!target || !isInternal(target, ctx.input.site, ctx.options.internalHosts)) continue
      if (ctx.served.has(identity(target, ctx.input.site))) continue
      out.push(finding({
        group,
        check: 'navigation.pagination-broken',
        severity: 'warning',
        url,
        message: `rel="${token}" points at a page the build does not serve.`,
        detail: link.href,
      }))
    }
  }

  const before = ctx.baselineByIdentity.get(identity(url, ctx.input.site))
  if (before) {
    const feedRel = (html: string) => linksRel(html, 'alternate').some(link => /rss|atom|feed/i.test(link.type ?? ''))
    if (feedRel(before.html) && !feedRel(doc.html)) {
      out.push(finding({ group, check: 'navigation.feed-lost', severity: 'warning', url, message: 'The old page advertised a feed; this one does not.' }))
    }
  }

  return out
}

/**
 * References to the origin the content was migrated away from.
 *
 * A generated page that still points at the old WordPress host has not been
 * migrated, it has been mirrored: the new site works only while the old one
 * stays up, and the day it goes away the images and stylesheets go with it.
 * Across a blind cohort this was the single largest thing keeping sites from
 * being deliverable, so it is an error rather than a warning.
 *
 * The scan is over raw text, not parsed attributes, because the references hide
 * in every shape a reference can take — `src`, `srcset`, `href`, `url()` in a
 * style attribute, a string inside inline script. That over-matches slightly:
 * the origin written in a comment or in visible prose counts too. Reported that
 * way on purpose — a literal old-host URL on the page is worth looking at even
 * when it is not fetched.
 *
 * Stylesheets and scripts are scanned only when their contents are supplied
 * (`input.files`). Without them the count is HTML-only, which is a smaller
 * number than the truth rather than a wrong one — and the report says so.
 */
export function sourceOriginChecks(ctx: Context): Finding[] {
  const origin = ctx.options.sourceOrigin
  if (!origin) return []

  let host: string
  try {
    host = new URL(origin.includes('://') ? origin : `https://${origin}`).host
  } catch {
    return [finding({
      group: 'assets',
      check: 'assets.source-origin-invalid',
      severity: 'warning',
      message: `sourceOrigin "${origin}" is not a host or a URL; the scan did not run.`,
    })]
  }
  if ((ctx.options.allowHosts ?? []).includes(host)) return []

  const out: Finding[] = []
  const pattern = new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'gi')
  const count = (source: string) => (source.match(pattern) ?? []).length

  for (const doc of ctx.input.documents) {
    const hits = count(doc.html)
    if (hits) {
      out.push(finding({
        group: 'assets',
        check: 'assets.source-origin-reference',
        severity: 'error',
        url: doc.url,
        message: `${hits} reference${hits === 1 ? '' : 's'} to the source origin ${host} — this page still depends on the site it replaced.`,
      }))
    }
  }

  for (const file of ctx.input.files ?? []) {
    const hits = count(file.content)
    if (hits) {
      out.push(finding({
        group: 'assets',
        check: 'assets.source-origin-reference',
        severity: 'error',
        url: file.path,
        message: `${hits} reference${hits === 1 ? '' : 's'} to the source origin ${host}.`,
      }))
    }
  }

  return out
}

// ─── assets ───

export function assetChecks(doc: VerifyDocument, ctx: Context): Finding[] {
  const out: Finding[] = []
  const group = 'assets' as const
  const url = doc.url
  const refs = images(doc.html)

  const broken = new Set<string>()
  for (const image of refs) {
    if (/^data:/i.test(image.src)) continue
    const target = resolve(image.src, url, ctx.input.site)
    if (!target || !isInternal(target, ctx.input.site, ctx.options.internalHosts)) continue
    if (ctx.served.has(identity(target, ctx.input.site))) continue
    broken.add(image.src)
  }
  for (const src of broken) {
    out.push(finding({ group, check: 'assets.broken-image', severity: 'error', url, message: 'Image does not resolve to anything the build serves.', detail: src }))
  }

  // `alt=""` is a decision (decorative); no `alt` attribute at all is an
  // omission. Only the second is reported.
  const noAlt = refs.filter(image => image.alt === undefined)
  if (noAlt.length) {
    out.push(finding({
      group,
      check: 'assets.missing-alt',
      severity: 'warning',
      url,
      message: `${noAlt.length} image${noAlt.length === 1 ? '' : 's'} without an alt attribute.`,
      detail: noAlt.slice(0, 5).map(image => image.src).join(', '),
    }))
  }

  const before = ctx.baselineByIdentity.get(identity(url, ctx.input.site))
  if (before) {
    const had = new Map(images(before.html).filter(i => i.alt).map(i => [identity(resolve(i.src, before.url, ctx.input.site) ?? i.src, ctx.input.site), i.alt!]))
    const now = new Map(refs.map(i => [identity(resolve(i.src, url, ctx.input.site) ?? i.src, ctx.input.site), i.alt]))
    const lost = [...had.keys()].filter(src => now.has(src) && !now.get(src))
    if (lost.length) {
      out.push(finding({
        group,
        check: 'assets.alt-lost',
        severity: 'warning',
        url,
        message: `${lost.length} image${lost.length === 1 ? '' : 's'} lost alt text the old page had.`,
        detail: lost.slice(0, 5).join(', '),
      }))
    }
  }

  return out
}
