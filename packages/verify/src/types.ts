// ─── What a verification run is given, and what it answers with ───
//
// Everything here is data the caller already has. The package never fetches:
// a hardened crawler is a security surface of its own (SSRF, DNS rebinding,
// redirect and byte limits) and belongs where that hardening lives, not in the
// MIT library every consumer embeds. Whoever holds a safe fetcher — or a
// directory of built files — supplies the documents.
//
// The consequence is that this runs identically over a `dist/` directory, over
// a captured baseline, and inside another tool's pipeline, with no network and
// no mocking.

/** One page as served: the address it answers at and what it answered with. */
export interface VerifyDocument {
  /** Absolute URL, or a site-relative path (`/about/`). */
  url: string
  html: string
  /** Defaults to 200 when the caller did not record one. */
  status?: number
  /** Response headers, lowercased keys. `x-robots-tag` is read here. */
  headers?: Record<string, string>
}

export interface VerifyRedirect {
  from: string
  to: string
  status: number
}

export const CHECK_GROUPS = [
  /** canonical, `<title>`, description, Open Graph, Twitter card */
  'identity',
  /** robots meta, X-Robots-Tag, noindex leaks, sitemap membership */
  'indexing',
  /** status parity, soft-404, redirect chains */
  'status',
  /** hreflang pairs and reciprocity */
  'international',
  /** JSON-LD validity and type parity */
  'structured',
  /** internal links, pagination, feeds */
  'navigation',
  /** image resolution and alt preservation */
  'assets',
] as const

export type CheckGroup = (typeof CHECK_GROUPS)[number]

export type Severity = 'error' | 'warning' | 'info'

/**
 * One thing that is wrong, or worth knowing.
 *
 * `check` is a stable id (`identity.canonical-mismatch`) so a consumer can
 * suppress, threshold or track one finding without matching on prose.
 */
export interface Finding {
  group: CheckGroup
  check: string
  severity: Severity
  /** The document the finding is about, when it is about one. */
  url?: string
  message: string
  detail?: string
}

export interface VerifyReport {
  /** No `error` findings. This is the gate. */
  passed: boolean
  findings: Finding[]
  counts: Record<Severity, number>
  /** How many documents were examined. */
  documents: number
  /** Which groups actually ran. */
  groups: CheckGroup[]
  /** Groups that were asked for but could not run, and why. */
  skipped: { group: CheckGroup, reason: string }[]
}

export interface VerifyOptions {
  /**
   * A redirect chain longer than this is reported. One hop is normal; two is a
   * link-equity leak and a latency cost, and chains grow silently as redirect
   * rules accumulate over migrations.
   */
  maxRedirectHops?: number
  /**
   * A 200 response shorter than this many characters of text, whose title or
   * body says "not found", is treated as a soft-404. Kept configurable because
   * a legitimately short page exists; the default is deliberately low.
   */
  soft404MaxTextLength?: number
  /** Hosts to treat as internal besides `site`'s own. */
  internalHosts?: string[]
}

export interface VerifyInput {
  /** The built site. */
  documents: VerifyDocument[]
  /** The site's canonical origin (`https://example.com`). Several checks need it. */
  site?: string
  /** `sitemap.xml` as produced by the build. */
  sitemap?: string
  /** Redirect rules the host will serve. */
  redirects?: VerifyRedirect[]
  /** Non-document files the build produced, as served (`/images/a.png`). */
  assets?: string[]
  /** The old site, for parity checks. Absent means only self-checks run. */
  baseline?: { documents: VerifyDocument[] }
  /** Defaults to every group. */
  groups?: readonly CheckGroup[]
  options?: VerifyOptions
}
