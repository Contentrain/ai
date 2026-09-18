import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JsonlDecisionCache, MemoryDecisionCache, cacheKey } from './cache.js'
import type { CachedDecision } from './cache.js'

const value: CachedDecision = { kind: 'punch_item', version: '1', choice: 'measurement', score: 1.2, confidence: 0.7, source: 'jev', at: '2026-09-18T00:00:00.000Z' }

describe('cacheKey', () => {
  it('is sha256 hex, the same for the same shaped input whatever its key order', () => {
    const a = cacheKey('punch_item', '1', { label: 'x', reason: 'y', site: { median: 1, decision: 'd' } })
    const b = cacheKey('punch_item', '1', { site: { decision: 'd', median: 1 }, reason: 'y', label: 'x' })
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(b)
  })

  it('changes with the kind, the schema version and the input', () => {
    const base = cacheKey('punch_item', '1', { label: 'x' })
    expect(cacheKey('punch_item', '2', { label: 'x' })).not.toBe(base)
    expect(cacheKey('eligibility_band', '1', { label: 'x' })).not.toBe(base)
    expect(cacheKey('punch_item', '1', { label: 'y' })).not.toBe(base)
  })
})

describe('MemoryDecisionCache', () => {
  it('returns what was set and nothing else', async () => {
    const cache = new MemoryDecisionCache()
    await cache.set('k', value)
    expect(await cache.get('k')).toEqual(value)
    expect(await cache.get('other')).toBeUndefined()
    expect(cache.size).toBe(1)
  })
})

describe('JsonlDecisionCache', () => {
  it('appends one line per answer and a new instance reads them back, last line winning', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'decide-cache-')), 'nested', 'cache.jsonl')
    const first = new JsonlDecisionCache(path)
    expect(await first.get('k')).toBeUndefined()
    await first.set('k', value)
    await first.set('k', { ...value, choice: 'cosmetic' })
    await first.set('j', value)
    const lines = (await readFile(path, 'utf8')).trimEnd().split('\n')
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]!)).toEqual({ key: 'k', value })
    const second = new JsonlDecisionCache(path)
    expect((await second.get('k'))?.choice).toBe('cosmetic')
    expect(await second.get('j')).toEqual(value)
  })

  it('skips a torn line instead of failing', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'decide-cache-')), 'cache.jsonl')
    await writeFile(path, `${JSON.stringify({ key: 'k', value })}\n{"key":"j","val`)
    const cache = new JsonlDecisionCache(path)
    expect(await cache.get('k')).toEqual(value)
    expect(await cache.get('j')).toBeUndefined()
  })
})
