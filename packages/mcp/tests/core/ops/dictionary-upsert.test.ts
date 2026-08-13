import type { ContentrainConfig, ModelDefinition } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { planContentSave } from '../../../src/core/ops/content-save.js'
import type { RepoReader } from '../../../src/core/contracts/index.js'

/**
 * Changing an existing dictionary value used to be refused outright, which made
 * the most ordinary operation on a dictionary — correcting a translation —
 * impossible. The documented workaround was delete, merge, save, merge: four
 * operations and two branches to fix one string.
 *
 * The refusal also advised "include all keys in a single save call", which
 * could not work: the check compares values per key, so sending all 288 keys
 * still reported every changed one as a collision.
 *
 * Choosing a translation is a content decision, and this codebase's rule is
 * that MCP does not make those. It reports them, in the same idiom the
 * duplicate-value advisory in this function already used.
 */

const MODEL: ModelDefinition = {
  id: 'ui-strings',
  name: 'UI Strings',
  kind: 'dictionary',
  domain: 'system',
  i18n: true,
  title_field: 'key',
}

const CONFIG = {
  version: 1,
  stack: 'nuxt',
  workflow: 'review',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['system'],
} as unknown as ContentrainConfig

const PATH = '.contentrain/content/system/ui-strings/en.json'

function readerWith(data: Record<string, string>): RepoReader {
  const files = { [PATH]: JSON.stringify(data) }
  return {
    readFile: (p: string) => p in files
      ? Promise.resolve(files[p]!)
      : Promise.reject(new Error(`ENOENT ${p}`)),
    listDirectory: () => Promise.resolve([]),
    fileExists: (p: string) => Promise.resolve(p in files),
  }
}

const contentOf = (changes: Array<{ path: string; content: string | null }>): Record<string, string> =>
  JSON.parse(changes.find(c => c.path === PATH)!.content!) as Record<string, string>

describe('planContentSave — dictionary', () => {
  it('replaces an existing value instead of refusing (the reported bug)', async () => {
    const plan = await planContentSave(readerWith({ 'nav.home': 'Home', 'nav.about': 'About' }), {
      model: MODEL,
      config: CONFIG,
      entries: [{ locale: 'en', data: { 'nav.home': 'Homepage' } }],
    })

    expect(contentOf(plan.changes)).toEqual({ 'nav.home': 'Homepage', 'nav.about': 'About' })
  })

  it('reports the replacement, with the value it replaced', async () => {
    const plan = await planContentSave(readerWith({ 'nav.home': 'Home' }), {
      model: MODEL,
      config: CONFIG,
      entries: [{ locale: 'en', data: { 'nav.home': 'Homepage' } }],
    })

    const advisory = plan.advisories.find(a => a.includes('replaced'))
    expect(advisory).toBeDefined()
    expect(advisory).toContain('"nav.home": "Home" → "Homepage"')
    expect(plan.result[0]!.advisories).toContain(advisory)
  })

  it('says nothing when the value is unchanged', async () => {
    const plan = await planContentSave(readerWith({ 'nav.home': 'Home' }), {
      model: MODEL,
      config: CONFIG,
      entries: [{ locale: 'en', data: { 'nav.home': 'Home', 'nav.new': 'New' } }],
    })

    expect(plan.advisories.filter(a => a.includes('replaced'))).toEqual([])
    expect(contentOf(plan.changes)['nav.new']).toBe('New')
  })

  // 288-key dictionaries are real; an advisory naming every changed key is
  // as unreadable as no advisory at all.
  it('collapses to a count past a handful of keys', async () => {
    const existing = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`k${i}`, `old${i}`]),
    )
    const incoming = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`k${i}`, `new${i}`]),
    )

    const plan = await planContentSave(readerWith(existing), {
      model: MODEL,
      config: CONFIG,
      entries: [{ locale: 'en', data: incoming }],
    })

    const advisory = plan.advisories.find(a => a.includes('replaced'))!
    expect(advisory).toContain('replaced 12 existing value(s)')
    expect(advisory).toContain('and 7 more')
    expect(contentOf(plan.changes)['k11']).toBe('new11')
  })

  it('keeps keys the save did not mention', async () => {
    const plan = await planContentSave(readerWith({ a: '1', b: '2', c: '3' }), {
      model: MODEL,
      config: CONFIG,
      entries: [{ locale: 'en', data: { b: 'two' } }],
    })

    expect(contentOf(plan.changes)).toEqual({ a: '1', b: 'two', c: '3' })
  })

  // The advisory that predates this one, still reporting.
  it('still flags a new key whose value duplicates an existing one', async () => {
    const plan = await planContentSave(readerWith({ 'nav.home': 'Home' }), {
      model: MODEL,
      config: CONFIG,
      entries: [{ locale: 'en', data: { 'footer.home': 'Home' } }],
    })

    expect(plan.advisories.some(a => a.includes('already exists as key "nav.home"'))).toBe(true)
  })
})
