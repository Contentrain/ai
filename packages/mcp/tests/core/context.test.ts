import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepoReader } from '../../src/core/contracts/index.js'
import { buildContextChange, type ContextStats } from '../../src/core/context.js'

/**
 * buildContextChange stats-injection: passing pre-computed `opts.stats`
 * must produce a byte-identical context.json to the scanned variant while
 * skipping the O(models·locales) reader walk. Uses an in-memory reader so
 * there are no git subprocesses.
 */

class MemoryReader implements RepoReader {
  constructor(private readonly files: Map<string, string>) {}

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`not found: ${path}`)
    return content
  }

  async listDirectory(path: string): Promise<string[]> {
    const prefix = `${path}/`
    const names = new Set<string>()
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      names.add(rest.split('/')[0]!)
    }
    return [...names]
  }

  async fileExists(path: string): Promise<boolean> {
    if (this.files.has(path)) return true
    const prefix = `${path}/`
    for (const key of this.files.keys()) if (key.startsWith(prefix)) return true
    return false
  }
}

function fixtureReader(): MemoryReader {
  const files = new Map<string, string>()
  files.set('.contentrain/config.json', JSON.stringify({
    version: 1,
    stack: 'other',
    workflow: 'auto-merge',
    locales: { default: 'en', supported: ['en', 'tr'] },
    domains: ['blog'],
  }))
  files.set('.contentrain/models/hero.json', JSON.stringify({
    id: 'hero', name: 'Hero', kind: 'singleton', domain: 'blog', i18n: true,
    fields: { title: { type: 'string', required: true } },
  }))
  return new MemoryReader(files)
}

const OP = { tool: 'contentrain_content_save', model: 'hero', locale: 'en' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-09T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('buildContextChange stats injection', () => {
  it('produces byte-identical output to the scanned variant', async () => {
    const reader = fixtureReader()

    const scanned = await buildContextChange(reader, OP)
    // Read back what the scan computed, then inject exactly that.
    const scannedStats = JSON.parse(scanned.content).stats as { models: number, entries?: number }
    const stats: ContextStats = { models: scannedStats.models, entries: scannedStats.entries ?? null }

    const injected = await buildContextChange(reader, OP, undefined, { stats })

    expect(injected.path).toBe(scanned.path)
    expect(injected.content).toBe(scanned.content)
  })

  it('skips the model/entry scan when stats are injected', async () => {
    const reader = fixtureReader()
    const listSpy = vi.spyOn(reader, 'listDirectory')

    await buildContextChange(reader, OP, undefined, { stats: { models: 1, entries: 0 } })

    // listModels / countEntries both go through listDirectory; the injected
    // path must not touch it (only readConfig's readFile runs).
    expect(listSpy).not.toHaveBeenCalled()
  })

  it('still walks the reader when stats are NOT injected', async () => {
    const reader = fixtureReader()
    const listSpy = vi.spyOn(reader, 'listDirectory')

    await buildContextChange(reader, OP)

    expect(listSpy).toHaveBeenCalled() // listModels reads .contentrain/models
  })

  it('drops a null entries count from the emitted stats', async () => {
    const reader = fixtureReader()

    const change = await buildContextChange(reader, OP, undefined, { stats: { models: 2, entries: null } })
    const stats = JSON.parse(change.content).stats as Record<string, unknown>

    expect(stats['models']).toBe(2)
    expect('entries' in stats).toBe(false)
  })
})
