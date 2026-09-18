import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { log } from '@clack/prompts'

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

// The Bridge e2e fixture @contentrain/wp-import tests the planner with, laid
// out the way a delivered repository and a bridge export sit on disk.
const FIXTURE = join(import.meta.dirname, '../../../wp-import/src/fixtures/bridge-e2e')

async function layout(from: string, to: string): Promise<void> {
  await cp(from, join(to, '.contentrain'), { recursive: true })
  await mkdir(join(to, 'bridge'), { recursive: true })
  await rename(join(to, '.contentrain/entry-source-map.json'), join(to, 'bridge/entry-source-map.json'))
}

const run = async (args: Record<string, unknown>) => {
  const mod = await import('../../src/commands/delta.js')
  await mod.default.run?.({ args } as never)
}

describe('delta command', () => {
  let dir: string
  let store: string
  let incoming: string
  const deltaPath = join(FIXTURE, 't1.delta.json')

  beforeEach(async () => {
    vi.clearAllMocks()
    process.exitCode = undefined
    dir = await mkdtemp(join(tmpdir(), 'cr-delta-'))
    store = join(dir, 'repo')
    incoming = join(dir, 'export')
    await layout(join(FIXTURE, 't0'), store)
    await layout(join(FIXTURE, 't1'), incoming)
  })

  it('refuses without --dry-run: it has no apply mode', async () => {
    await run({ delta: deltaPath, store, incoming })
    expect(process.exitCode).toBe(1)
    expect(vi.mocked(log.error).mock.calls[0]![0]).toContain('Pass --dry-run')
  })

  it('prints the planned SourceDeltaPlan as JSON', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    await run({ delta: deltaPath, store, incoming, 'dry-run': true, json: true })
    const plan = JSON.parse(String(out.mock.calls[0]![0]))
    out.mockRestore()
    expect(process.exitCode).toBeUndefined()
    expect(plan.entries.map((e: { op: string, entry_id: string }) => [e.op, e.entry_id])).toEqual([
      ['updated', 'entry-62'], ['moved', 'entry-63'], ['deleted', 'entry-64'],
    ])
    expect(plan.entries[0].fields_changed).toEqual(['body', 'modified'])
    expect(plan.redirects).toEqual([{ from: '/e2e-renamed-post-038932/', to: '/e2e-renamed-new-038932/', status: 301 }])
  })

  it('reports a repository edit as a conflict and writes nothing', async () => {
    const metaPath = join(store, '.contentrain/meta/wp-post/entry-62/en-us.json')
    await writeFile(metaPath, `${JSON.stringify({ source: 'human', status: 'published', updated_by: 'editor@example.com' })}\n`)
    const before = await readFile(metaPath, 'utf8')
    await run({ delta: deltaPath, store, incoming, 'dry-run': true })
    expect(process.exitCode).toBeUndefined()
    const report = String(vi.mocked(log.message).mock.calls[0]![0])
    expect(report).toContain('Conflicts (1):')
    expect(report).toContain('edited by editor@example.com')
    expect(await readFile(metaPath, 'utf8')).toBe(before)
  })

  it('fails clearly when the store has no source map', async () => {
    await rename(join(store, 'bridge/entry-source-map.json'), join(dir, 'elsewhere.json'))
    await run({ delta: deltaPath, store, incoming, 'dry-run': true })
    expect(process.exitCode).toBe(1)
    expect(vi.mocked(log.error).mock.calls[0]![0]).toContain('entry-source-map.json')
  })
})
