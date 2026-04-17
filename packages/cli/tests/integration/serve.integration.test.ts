import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 })

const routes = new Map<string, (event?: Record<string, unknown>) => unknown>()
const appUseMock = vi.fn()
const callToolMock = vi.fn()
const branchLocalMock = vi.fn().mockResolvedValue({
  current: 'main',
  all: ['main', 'cr/review/hero/en/123', 'feature/redesign'],
})
const diffMock = vi.fn().mockResolvedValue('diff --stat')
const checkoutMock = vi.fn().mockResolvedValue(undefined)
const mergeMock = vi.fn().mockResolvedValue(undefined)

let connectionHandler: ((ws: FakeWs, req: unknown) => void) | null = null
let watchAllHandler: ((eventType: string, filePath: string) => void) | null = null
let watchErrorHandler: ((err: unknown) => void) | null = null
let lastWs: FakeWs | null = null

class FakeWs {
  readyState = 1
  send = vi.fn()
  on = vi.fn()
}

vi.mock('h3', () => ({
  createApp: vi.fn(() => ({ use: appUseMock })),
  createRouter: vi.fn(() => ({
    add: vi.fn((path: string, handler: (event?: Record<string, unknown>) => unknown) => {
      routes.set(path, handler)
    }),
  })),
  defineEventHandler: vi.fn((handler) => handler),
  toNodeListener: vi.fn(() => vi.fn()),
  getRouterParam: vi.fn((event: Record<string, unknown>, key: string) => event.params?.[key as keyof typeof event.params]),
  readBody: vi.fn(async (event: Record<string, unknown>) => event.body),
  getQuery: vi.fn((event: Record<string, unknown>) => event.query ?? {}),
  createError: vi.fn(({ statusCode, message }: { statusCode: number; message: string }) =>
    Object.assign(new Error(message), { statusCode, statusMessage: message })),
}))

vi.mock('ws', () => ({
  WebSocketServer: class WebSocketServer {
    on(event: string, cb: (ws: FakeWs, req: unknown) => void) {
      if (event === 'connection') connectionHandler = cb
    }
    handleUpgrade(_req: unknown, _socket: unknown, _head: unknown, cb: (ws: FakeWs) => void) {
      lastWs = new FakeWs()
      cb(lastWs)
    }
    emit(event: string, ws: FakeWs, req: unknown) {
      if (event === 'connection') connectionHandler?.(ws, req)
    }
  },
}))

vi.mock('chokidar', () => ({
  watch: vi.fn(() => {
    const watcher = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'all') watchAllHandler = cb as (eventType: string, filePath: string) => void
        if (event === 'error') watchErrorHandler = cb as (err: unknown) => void
        return watcher
      }),
    }
    return watcher
  }),
}))

vi.mock('@contentrain/mcp/server', () => ({
  createServer: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@modelcontextprotocol/sdk/inMemory.js', () => ({
  InMemoryTransport: {
    createLinkedPair: vi.fn(() => [{}, {}]),
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class Client {
    async connect() {}
    async callTool(input: { name: string; arguments?: Record<string, unknown> }) {
      return await callToolMock(input)
    }
  },
}))

const branchMock = vi.fn().mockResolvedValue(undefined)
const rawMock = vi.fn().mockResolvedValue('')

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    branchLocal: branchLocalMock,
    branch: branchMock,
    diff: diffMock,
    checkout: checkoutMock,
    merge: mergeMock,
    deleteLocalBranch: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue({ all: [] }),
    raw: rawMock,
  })),
}))

// After the phase-13 delegation, the serve server calls MCP helpers
// for diff + merge instead of reimplementing the git dance. Mocks
// expose the shape the tests assert against.
const branchDiffMock = vi.fn()
const mergeBranchMock = vi.fn()
const checkBranchHealthMock = vi.fn().mockResolvedValue(null)

vi.mock('@contentrain/mcp/git/branch-lifecycle', () => ({
  branchDiff: branchDiffMock,
  checkBranchHealth: checkBranchHealthMock,
  cleanupMergedBranches: vi.fn().mockResolvedValue({ deleted: 0, remaining: 0, deletedBranches: [] }),
}))

vi.mock('@contentrain/mcp/git/transaction', () => ({
  mergeBranch: mergeBranchMock,
}))

vi.mock('@contentrain/mcp/core/config', () => ({
  readConfig: vi.fn(async () => ({
    version: 1,
    repository: { default_branch: 'main', provider: 'github' },
  })),
}))

let testDir: string
let uiDir: string

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  routes.clear()
  connectionHandler = null
  watchAllHandler = null
  watchErrorHandler = null
  lastWs = null

  testDir = await mkdtemp(join(tmpdir(), 'cr-cli-serve-'))
  uiDir = join(testDir, 'serve-ui')

  await mkdir(join(testDir, '.contentrain', 'models'), { recursive: true })
  await mkdir(join(testDir, '.contentrain', 'content', 'marketing', 'hero'), { recursive: true })
  await mkdir(uiDir, { recursive: true })

  await writeFile(join(testDir, '.contentrain', 'config.json'), JSON.stringify({ version: 1 }, null, 2))
  await writeFile(join(testDir, '.contentrain', 'context.json'), JSON.stringify({ stats: { models: 1 } }, null, 2))
  await writeFile(join(testDir, '.contentrain', 'models', 'hero.json'), JSON.stringify({ id: 'hero' }, null, 2))
  await writeFile(join(testDir, '.contentrain', 'content', 'marketing', 'hero', 'en.json'), JSON.stringify({ title: 'Hello' }, null, 2))
  await writeFile(join(uiDir, 'index.html'), '<!doctype html><html><body>Serve UI</body></html>')

  callToolMock.mockImplementation(async ({ name, arguments: args }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify({ ok: true, name, args }),
    }],
  }))
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(testDir, { recursive: true, force: true })
})

describe('serve server contract', { sequential: true }, () => {
  async function boot() {
    const mod = await import('../../src/serve/server.js')
    return await mod.createServeApp({ projectRoot: testDir, port: 3333, uiDir })
  }

  it('exposes MCP-backed API routes', async () => {
    await boot()

    const status = routes.get('/api/status')
    expect(status).toBeDefined()
    await expect(status?.()).resolves.toMatchObject({ ok: true, name: 'contentrain_status' })
  })

  it('accepts quick-fix POST and passes the correct save payload to MCP', async () => {
    await boot()

    const handler = routes.get('/api/content/:modelId/:entryId/fix')
    await expect(handler?.({
      method: 'POST',
      params: { modelId: 'hero', entryId: 'homepage' },
      body: { locale: 'en', data: { title: 'Updated' } },
    })).resolves.toMatchObject({ ok: true, name: 'contentrain_content_save' })

    expect(callToolMock).toHaveBeenCalledWith({
      name: 'contentrain_content_save',
      arguments: {
        model: 'hero',
        entries: [{ id: 'homepage', locale: 'en', data: { title: 'Updated' } }],
      },
    })
  })

  it('broadcasts branch creation after a review-workflow quick fix creates a contentrain branch', async () => {
    callToolMock.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          git: {
            branch: 'cr/content/hero/homepage/20260314-120000',
            action: 'pending-review',
          },
        }),
      }],
    })

    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    const handler = routes.get('/api/content/:modelId/:entryId/fix')
    await handler?.({
      method: 'POST',
      params: { modelId: 'hero', entryId: 'homepage' },
      body: { locale: 'en', data: { title: 'Updated' } },
    })

    expect(lastWs?.send).toHaveBeenLastCalledWith(JSON.stringify({
      type: 'branch:created',
      branch: 'cr/content/hero/homepage/20260314-120000',
    }))
  })

  it('broadcasts validation updates after quick fixes so validation views can refresh', async () => {
    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    const handler = routes.get('/api/content/:modelId/:entryId/fix')
    await handler?.({
      method: 'POST',
      params: { modelId: 'hero', entryId: 'homepage' },
      body: { locale: 'en', data: { title: 'Updated' } },
    })

    expect(lastWs?.send).toHaveBeenCalledWith(JSON.stringify({ type: 'validation:updated' }))
  })

  it('rejects GET on the quick-fix endpoint', async () => {
    await boot()

    const handler = routes.get('/api/content/:modelId/:entryId/fix')
    await expect(handler?.({
      method: 'GET',
      params: { modelId: 'hero', entryId: 'homepage' },
    })).rejects.toMatchObject({ statusCode: 405 })
  })

  it('lists only contentrain branches', async () => {
    await boot()

    const handler = routes.get('/api/branches')
    await expect(handler?.()).resolves.toEqual({
      branches: [{ name: 'cr/review/hero/en/123', current: false, system: false }],
      total: 1,
    })
  })

  it('rejects invalid branch diff requests', async () => {
    await boot()

    const handler = routes.get('/api/branches/diff')
    await expect(handler?.({
      query: { name: 'feature/redesign' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('exposes the normalize approve route promised by the serve spec', async () => {
    await boot()

    expect(routes.get('/api/normalize/approve')).toBeDefined()
  })

  it('exposes the normalize results route promised by the serve spec', async () => {
    await boot()

    expect(routes.get('/api/normalize/results')).toBeDefined()
  })

  it('delegates branch diff to MCP branchDiff helper (base defaults to contentrain)', async () => {
    // Feature branches fork from CONTENTRAIN_BRANCH, so that's what
    // the diff's base should be. The helper is called with just
    // `{ branch }` — `branchDiff` itself defaults the base to
    // `CONTENTRAIN_BRANCH`.
    branchDiffMock.mockResolvedValueOnce({
      branch: 'cr/content/hero/en/123',
      base: 'contentrain',
      stat: ' .contentrain/content/hero/en.json | 2 +-',
      patch: '+{"title":"Hi"}\n',
      filesChanged: 1,
    })

    await boot()

    const handler = routes.get('/api/branches/diff')
    const response = await handler?.({
      query: { name: 'cr/content/hero/en/123' },
    }) as Record<string, unknown>

    expect(branchDiffMock).toHaveBeenCalledWith(testDir, { branch: 'cr/content/hero/en/123' })
    expect(response.base).toBe('contentrain')
    expect(response.filesChanged).toBe(1)
  })

  it('delegates branch approval to MCP mergeBranch helper and surfaces sync skips', async () => {
    // The old implementation reimplemented worktree + update-ref +
    // checkout. The new one calls MCP's mergeBranch() which runs the
    // transaction with selective sync. Skipped files flow back via
    // the response and a `sync:warning` broadcast.
    mergeBranchMock.mockResolvedValueOnce({
      action: 'auto-merged',
      commit: 'abc1234',
      sync: {
        synced: ['.contentrain/content/hero/en.json'],
        skipped: ['.contentrain/content/hero/tr.json'],
      },
    })

    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    const handler = routes.get('/api/branches/approve')
    const response = await handler?.({
      method: 'POST',
      body: { branch: 'cr/content/hero/en/123' },
    }) as Record<string, unknown>

    expect(mergeBranchMock).toHaveBeenCalledWith(testDir, 'cr/content/hero/en/123')
    expect(response.status).toBe('merged')
    expect(response.commit).toBe('abc1234')
    const sync = response.sync as { skipped: string[] }
    expect(sync.skipped).toEqual(['.contentrain/content/hero/tr.json'])

    // The broadcast surface the UI listens to — fake WS client
    // received both branch:merged and sync:warning.
    const messages = lastWs?.send.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string)) ?? []
    expect(messages.some(m => m.type === 'branch:merged')).toBe(true)
    expect(messages.some(m => m.type === 'sync:warning' && m.skippedCount === 1)).toBe(true)
  })

  it('broadcasts branch:merge-conflict when MCP mergeBranch throws', async () => {
    mergeBranchMock.mockRejectedValueOnce(new Error('CONFLICT (content): Merge conflict in en.json'))

    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    const handler = routes.get('/api/branches/approve')
    await expect(handler?.({
      method: 'POST',
      body: { branch: 'cr/content/hero/en/123' },
    })).rejects.toThrow(/Merge failed/)

    const messages = lastWs?.send.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string)) ?? []
    expect(messages.some(m => m.type === 'branch:merge-conflict')).toBe(true)
  })

  it('serves the SPA index for client-side routes', async () => {
    await boot()

    const staticMiddleware = appUseMock.mock.calls[0]?.[0] as (event: Record<string, unknown>) => Promise<Buffer>
    const event = {
      path: '/branches',
      node: { res: { setHeader: vi.fn() } },
    }

    const response = await staticMiddleware(event)
    expect(String(response)).toContain('Serve UI')
    expect(event.node.res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html')
  })

  it('broadcasts config changes over websocket', async () => {
    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    expect(lastWs?.send).toHaveBeenCalledWith(JSON.stringify({ type: 'connected' }))

    watchAllHandler?.('change', join(testDir, '.contentrain', 'config.json'))
    await vi.advanceTimersByTimeAsync(301)

    expect(lastWs?.send).toHaveBeenLastCalledWith(JSON.stringify({ type: 'config:changed' }))
  })

  it('broadcasts content changes with the correct modelId and locale', async () => {
    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    watchAllHandler?.('change', join(testDir, '.contentrain', 'content', 'marketing', 'hero', 'en.json'))
    await vi.advanceTimersByTimeAsync(301)

    expect(lastWs?.send).toHaveBeenLastCalledWith(JSON.stringify({
      type: 'content:changed',
      modelId: 'hero',
      locale: 'en',
    }))
  })

  it('broadcasts parsed context payloads when context.json changes', async () => {
    await writeFile(
      join(testDir, '.contentrain', 'context.json'),
      JSON.stringify({ stats: { models: 2 }, lastOperation: { tool: 'model_save' } }, null, 2),
    )

    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    watchAllHandler?.('change', join(testDir, '.contentrain', 'context.json'))
    await vi.advanceTimersByTimeAsync(301)

    expect(lastWs?.send).toHaveBeenLastCalledWith(JSON.stringify({
      type: 'context:changed',
      context: {
        stats: { models: 2 },
        lastOperation: { tool: 'model_save' },
      },
    }))
  })

  // ─── Phase 14b — meta watcher, error broadcast, new routes ───

  it('broadcasts meta:changed when .contentrain/meta/<model>/<locale>.json updates', async () => {
    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    watchAllHandler?.('change', join(testDir, '.contentrain', 'meta', 'hero', 'en.json'))
    await vi.advanceTimersByTimeAsync(301)

    expect(lastWs?.send).toHaveBeenLastCalledWith(JSON.stringify({
      type: 'meta:changed',
      modelId: 'hero',
      locale: 'en',
    }))
  })

  it('broadcasts meta:changed with entryId when the path is <model>/<entry>/<locale>.json', async () => {
    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    watchAllHandler?.('change', join(testDir, '.contentrain', 'meta', 'docs-packages', 'mcp', 'en.json'))
    await vi.advanceTimersByTimeAsync(301)

    expect(lastWs?.send).toHaveBeenLastCalledWith(JSON.stringify({
      type: 'meta:changed',
      modelId: 'docs-packages',
      entryId: 'mcp',
      locale: 'en',
    }))
  })

  it('broadcasts file-watch:error when chokidar emits an error', async () => {
    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    watchErrorHandler?.(new Error('ENOSPC: too many watchers'))

    const messages = lastWs?.send.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string)) ?? []
    const err = messages.find(m => m.type === 'file-watch:error')
    expect(err).toBeDefined()
    expect(err.message).toContain('ENOSPC')
    expect(typeof err.timestamp).toBe('string')
  })

  it('exposes /api/describe-format that invokes the contentrain_describe_format tool', async () => {
    await boot()

    const handler = routes.get('/api/describe-format')
    expect(handler).toBeDefined()
    await handler?.()

    expect(callToolMock).toHaveBeenCalledWith({
      name: 'contentrain_describe_format',
      arguments: {},
    })
  })

  it('/api/doctor wraps contentrain_doctor and forwards ?usage=true', async () => {
    await boot()

    const handler = routes.get('/api/doctor')
    expect(handler).toBeDefined()

    await handler?.({ query: {} })
    expect(callToolMock).toHaveBeenLastCalledWith({
      name: 'contentrain_doctor',
      arguments: { usage: false },
    })

    await handler?.({ query: { usage: 'true' } })
    expect(callToolMock).toHaveBeenLastCalledWith({
      name: 'contentrain_doctor',
      arguments: { usage: true },
    })

    await handler?.({ query: { usage: '1' } })
    expect(callToolMock).toHaveBeenLastCalledWith({
      name: 'contentrain_doctor',
      arguments: { usage: true },
    })
  })

  it('exposes /api/preview/merge and rejects requests for non-cr branches', async () => {
    await boot()

    const handler = routes.get('/api/preview/merge')
    expect(handler).toBeDefined()
    await expect(handler?.({ query: { branch: 'feature/redesign' } })).rejects.toMatchObject({ statusCode: 400 })
    await expect(handler?.({ query: {} })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('returns a clean FF-possible preview when CONTENTRAIN_BRANCH is an ancestor', async () => {
    // Preview contract: the first `merge-base --is-ancestor` call
    // (branch ancestor-of CONTENTRAIN_BRANCH) rejects — branch is NOT
    // already merged. The second (CONTENTRAIN_BRANCH ancestor-of
    // branch) resolves — FF is possible. `merge-base` returns a sha.
    // `merge-tree` returns empty — no conflicts. branchDiff gives
    // stat + filesChanged.
    rawMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
        const from = args[2]
        if (from === 'cr/review/hero/en/123') throw new Error('not ancestor')
        return ''
      }
      if (args[0] === 'merge-base') return 'deadbeef1234\n'
      if (args[0] === 'merge-tree') return ''
      return ''
    })
    branchDiffMock.mockResolvedValueOnce({
      branch: 'cr/review/hero/en/123',
      base: 'contentrain',
      stat: ' .contentrain/content/hero/en.json | 2 +-',
      patch: '',
      filesChanged: 1,
    })

    await boot()
    const handler = routes.get('/api/preview/merge')
    const response = await handler?.({ query: { branch: 'cr/review/hero/en/123' } }) as Record<string, unknown>

    expect(response.alreadyMerged).toBe(false)
    expect(response.canFastForward).toBe(true)
    expect(response.conflicts).toEqual([])
    expect(response.filesChanged).toBe(1)
  })

  it('plan/reject accepts an optional reason body without breaking the delete flow', async () => {
    const { handleUpgrade } = await boot()
    handleUpgrade({ url: '/ws' } as never, {} as never, Buffer.alloc(0))

    const handler = routes.get('/api/normalize/plan/reject')
    expect(handler).toBeDefined()

    // With body: parses via Zod schema.
    await writeFile(join(testDir, '.contentrain', 'normalize-plan.json'), JSON.stringify({ status: 'pending' }))
    await expect(handler?.({
      method: 'POST',
      body: { reason: 'Too many false positives' },
    })).resolves.toMatchObject({ status: 'rejected' })

    // Without body: still works (backwards compat).
    await writeFile(join(testDir, '.contentrain', 'normalize-plan.json'), JSON.stringify({ status: 'pending' }))
    await expect(handler?.({
      method: 'POST',
    })).resolves.toMatchObject({ status: 'rejected' })

    // Malformed body: rejected with 400.
    await writeFile(join(testDir, '.contentrain', 'normalize-plan.json'), JSON.stringify({ status: 'pending' }))
    await expect(handler?.({
      method: 'POST',
      body: { reason: 12345 },
    })).rejects.toMatchObject({ statusCode: 400 })
  })
})
