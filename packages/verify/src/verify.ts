// ─── Running the gates ───

import type { CheckGroup, Finding, Severity, VerifyInput, VerifyReport } from './types.js'
import { CHECK_GROUPS } from './types.js'
import type { Context } from './checks.js'
import {
  assetChecks, identityChecks, indexingChecks, internationalChecks, navigationChecks,
  notFoundPageChecks, redirectChecks, sitemapStaleChecks, sourceOriginChecks,
  statusChecks, structuredChecks,
} from './checks.js'
import { identity } from './url.js'

const DEFAULTS = { maxRedirectHops: 1, soft404MaxTextLength: 600 }

/**
 * Checks that need an input the caller did not supply. Reported rather than
 * silently omitted: a green report over a run that never compared anything is
 * the most dangerous output this package could produce.
 */
function absentInputs(input: VerifyInput, groups: readonly CheckGroup[]): { group: CheckGroup, reason: string }[] {
  const skipped: { group: CheckGroup, reason: string }[] = []
  if (!input.baseline) {
    for (const group of ['status', 'structured', 'navigation', 'assets'] as const) {
      if (groups.includes(group)) skipped.push({ group, reason: 'no baseline — parity checks did not run' })
    }
  }
  if (input.sitemap === undefined && groups.includes('indexing')) {
    skipped.push({ group: 'indexing', reason: 'no sitemap — membership checks did not run' })
  }
  if (!input.redirects?.length && groups.includes('status')) {
    skipped.push({ group: 'status', reason: 'no redirect rules — chain and target checks did not run' })
  }
  if (!input.build && groups.includes('status')) {
    skipped.push({ group: 'status', reason: 'not a build directory — the 404 page check did not run' })
  }
  if (!input.options?.sourceOrigin && groups.includes('assets')) {
    skipped.push({ group: 'assets', reason: 'no sourceOrigin — the old-host reference scan did not run' })
  } else if (!input.files?.length && groups.includes('assets')) {
    skipped.push({ group: 'assets', reason: 'no stylesheet or script contents — the old-host scan covered HTML only' })
  }
  return skipped
}

function buildContext(input: VerifyInput): Context {
  const options = { ...DEFAULTS, ...input.options }
  const byIdentity = new Map(input.documents.map(doc => [identity(doc.url, input.site), doc]))
  const baselineByIdentity = new Map((input.baseline?.documents ?? []).map(doc => [identity(doc.url, input.site), doc]))
  const served = new Set<string>([
    ...byIdentity.keys(),
    ...(input.assets ?? []).map(asset => identity(asset, input.site)),
  ])
  return { input, options, byIdentity, baselineByIdentity, served }
}

/**
 * Run the gates over a built site.
 *
 * Nothing is fetched. `input.documents` is the built site as served, and
 * `input.baseline` — when the caller has one — is the site it replaced. Without
 * a baseline every self-check still runs; only the parity checks (status
 * change, lost structured data, lost alt text, lost feed) go quiet, because
 * there is nothing to compare against.
 */
export function verify(input: VerifyInput): VerifyReport {
  const groups = [...(input.groups ?? CHECK_GROUPS)]
  const ctx = buildContext(input)
  const findings: Finding[] = []
  const skipped = absentInputs(input, groups)

  const run = (group: CheckGroup, fn: () => Finding[]) => {
    if (!groups.includes(group)) return
    findings.push(...fn())
  }

  for (const doc of input.documents) {
    run('identity', () => identityChecks(doc, ctx))
    run('indexing', () => indexingChecks(doc, ctx))
    run('status', () => statusChecks(doc, ctx))
    run('structured', () => structuredChecks(doc, ctx))
    run('navigation', () => navigationChecks(doc, ctx))
    run('assets', () => assetChecks(doc, ctx))
  }

  // Site-wide checks: these read the whole set, not one document.
  run('indexing', () => sitemapStaleChecks(ctx))
  run('status', () => redirectChecks(ctx))
  run('status', () => notFoundPageChecks(ctx))
  run('international', () => internationalChecks(ctx))
  run('assets', () => sourceOriginChecks(ctx))

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const item of findings) counts[item.severity] += 1

  return {
    passed: counts.error === 0,
    findings,
    counts,
    documents: input.documents.length,
    groups,
    skipped,
  }
}

/** A report as lines, most severe first. Used by the CLI and by consumers. */
export function formatReport(report: VerifyReport): string {
  const order: Severity[] = ['error', 'warning', 'info']
  const lines: string[] = []
  for (const severity of order) {
    for (const item of report.findings.filter(f => f.severity === severity)) {
      const where = item.url ? ` ${item.url}` : ''
      const detail = item.detail ? `\n    ${item.detail}` : ''
      lines.push(`${severity.toUpperCase().padEnd(7)} ${item.check}${where}\n    ${item.message}${detail}`)
    }
  }
  for (const { group, reason } of report.skipped) {
    lines.push(`SKIPPED ${group} — ${reason}`)
  }
  lines.push(
    `\n${report.documents} document${report.documents === 1 ? '' : 's'} · `
    + `${report.counts.error} error · ${report.counts.warning} warning · ${report.counts.info} info · `
    + (report.passed ? 'PASS' : 'FAIL'),
  )
  return lines.join('\n')
}
