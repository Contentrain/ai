import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import type { RawHardcodedText, RawIR, RawTextCandidate, RawTextOccurrence } from './index'
import { TEXT_CANDIDATE_KINDS, TEXT_EXCLUDE_REASONS } from './index'
import hardcodedTextJson from './fixtures/bridge-b08/hardcoded-text.json'

// The Bridge's own output (fixtures/bridge-b08/README.md). As in
// seo-routing.test.ts, `Record<keyof T, true>` holds each key list to its type
// and every key the producer writes must be one of them.

const TEXT_KEYS: Record<keyof RawHardcodedText, true> = { format: true, candidates: true, errors: true, totals: true }
const TOTALS_KEYS: Record<keyof RawHardcodedText['totals'], true> = {
  occurrences: true, occurrences_listed: true, unlisted_excluded: true, unlisted_by_reason: true,
  candidates: true, by_outcome: true, sources: true,
}
const CANDIDATE_KEYS: Record<keyof RawTextCandidate, true> = {
  id: true, value: true, locale: true, context: true, kind: true, source: true, line: true, occurrences: true,
  outcome: true, target: true, reason: true, related: true, key: true, decision: true,
}
const OCCURRENCE_KEYS: Record<keyof RawTextOccurrence, true> = { kind: true, source: true, line: true }
const ERROR_KEYS: Record<keyof RawHardcodedText['errors'][number], true> = { source: true, reason: true }

const undeclared = (value: object, declared: object) => Object.keys(value).filter(key => !(key in declared))
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

const text = hardcodedTextJson as unknown as RawHardcodedText
const { candidates, totals } = text
const excludeReasons: readonly string[] = TEXT_EXCLUDE_REASONS
// A redacted secret no longer carries the text its id and key were derived from.
const readable = candidates.filter(candidate => candidate.value !== '[redacted]')

describe('RawHardcodedText against the Bridge', () => {
  it('declares every key the Bridge writes', () => {
    expect(undeclared(text, TEXT_KEYS)).toEqual([])
    expect(undeclared(totals, TOTALS_KEYS)).toEqual([])
    for (const error of text.errors) expect(undeclared(error, ERROR_KEYS)).toEqual([])
    for (const candidate of candidates) {
      expect(undeclared(candidate, CANDIDATE_KEYS)).toEqual([])
      for (const occurrence of candidate.occurrences) expect(undeclared(occurrence, OCCURRENCE_KEYS)).toEqual([])
    }
  })

  it('holds the closed vocabularies', () => {
    expect(text.format).toBe('contentrain-bridge-hardcoded-text@1')
    const kinds = new Set(candidates.flatMap(c => [c.kind, ...c.occurrences.map(o => o.kind)]))
    expect([...kinds].filter(kind => !(TEXT_CANDIDATE_KINDS as readonly string[]).includes(kind))).toEqual([])
    // The fixture exercises every kind, so a kind the producer drops shows up here too.
    expect(kinds.size).toBe(TEXT_CANDIDATE_KINDS.length)
    for (const c of candidates) {
      expect(['transfer', 'exclude']).toContain(c.outcome)
      expect(['review', 'include', 'exclude']).toContain(c.decision)
      for (const reason of c.reason?.split(',') ?? []) expect(excludeReasons).toContain(reason)
      if (c.target) expect(c.target).toMatch(/^(dictionary:ui-strings|theme-settings\.[a-z_]+|site\.title|site\.description|content:wp-menu-items)$/)
    }
  })

  it('gives each candidate exactly one outcome', () => {
    for (const c of candidates) {
      if (c.outcome === 'transfer') {
        expect(c.target).toBeTypeOf('string')
        expect(c.reason).toBeUndefined()
      }
      else {
        expect(c.reason).toBeTypeOf('string')
        expect(c.target).toBeUndefined()
      }
    }
    const reasons = new Set(candidates.flatMap(c => c.reason?.split(',') ?? []))
    expect(reasons.has('secret')).toBe(true)
    expect(reasons.has('rendered-from-source')).toBe(true)
  })

  it('closes its totals', () => {
    const count = (outcome: RawTextCandidate['outcome']) => candidates.filter(c => c.outcome === outcome).length
    expect(totals.candidates).toBe(candidates.length)
    expect(totals.by_outcome).toEqual({ transfer: count('transfer'), exclude: count('exclude'), error: text.errors.length })
    expect(totals.by_outcome.transfer + totals.by_outcome.exclude).toBe(totals.candidates)
    expect(totals.occurrences_listed).toBe(candidates.reduce((sum, c) => sum + c.occurrences.length, 0))
    expect(totals.occurrences).toBe(totals.occurrences_listed + totals.unlisted_excluded)
    expect(Object.values(totals.unlisted_by_reason).reduce((sum, n) => sum + n, 0)).toBe(totals.unlisted_excluded)
    expect(totals).toMatchObject({ candidates: 96, occurrences: 201, by_outcome: { transfer: 40, exclude: 56, error: 2 } })
  })

  it('reports an unreadable source as an error, not a gap', () => {
    expect(text.errors).toEqual([
      { reason: 'source-over-2MiB', source: 'themes/bridge-text-theme/assets/huge.js' },
      { reason: 'render-fetch-failed: http_request_failed', source: 'render:unreachable' },
    ])
  })

  it('merges only equal text, locale and context, and derives id from exactly those', () => {
    expect(new Set(candidates.map(c => c.id)).size).toBe(candidates.length)
    expect(new Set(candidates.map(c => `${c.value}\0${c.locale}\0${c.context}`)).size).toBe(candidates.length)
    for (const c of readable) {
      expect(c.id).toBe(sha256(`${c.value}\0${c.locale}\0${c.context}`).slice(0, 20))
    }
    // The same words in three places stay three candidates.
    const openingHours = candidates.filter(c => c.value === 'Opening hours' && c.kind === 'render').map(c => c.context)
    expect(openingHours.toSorted()).toEqual(['footer>h2', 'footer>h3', 'header>h2'])
  })

  it('keys on text and context only, never on where the text was found', () => {
    expect(new Set(candidates.map(c => c.key)).size).toBe(candidates.length)
    for (const c of readable) {
      if (c.kind === 'customizer') expect(c.key).toBe(`theme-settings.${c.context.slice('customizer:'.length)}`)
      else expect(c.key.endsWith(`-${sha256(`${c.value}\0${c.context}`).slice(0, 6)}`)).toBe(true)
    }
  })

  it('points rendered text back at the source candidates it came from', () => {
    const byId = new Map(candidates.map(c => [c.id, c]))
    const rendered = candidates.filter(c => c.reason?.split(',').includes('rendered-from-source'))
    expect(rendered.length).toBeGreaterThan(0)
    for (const c of rendered) {
      expect(c.related?.length).toBeGreaterThan(0)
      for (const id of c.related!) expect(byId.get(id)?.kind).not.toBe('render')
    }
    for (const withRelated of candidates.filter(c => c.related)) expect(rendered).toContain(withRelated)
  })

  it('names its first occurrence and redacts a secret', () => {
    for (const c of candidates) {
      expect(c.occurrences.length).toBeGreaterThan(0)
      expect({ source: c.source, line: c.line }).toEqual({ source: c.occurrences[0]!.source, line: c.occurrences[0]!.line })
    }
    const secrets = candidates.filter(c => c.reason?.split(',').includes('secret'))
    expect(secrets.map(c => c.value)).toEqual(['[redacted]'])
  })

  it('fits RawIR as hardcoded_text', () => {
    const part: Pick<RawIR, 'hardcoded_text'> = { hardcoded_text: text }
    expect(part.hardcoded_text?.candidates).toHaveLength(96)
  })
})
