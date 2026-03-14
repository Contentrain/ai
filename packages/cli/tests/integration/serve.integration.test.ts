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
  all: ['main', 'contentrain/review/hero/en/123', 'feature/redesign'],
})
const diffMock = vi.fn().mockResolvedValue('diff --stat')
const checkoutMock = vi.fn().mockResolvedValue(undefined)
const mergeMock = vi.fn().mockResolvedValue(undefined)

let connectionHandler: ((ws: FakeWs, req: unknown) => void) | null = null
let watchAllHandler: ((eventType: string, filePath: string) => void) | null = null
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
      on: vi.fn((event: string, cb: (eventType: string, filePath: string) => void) => {
        if (event === 'all') watchAllHandler = cb
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

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    branchLocal: branchLocalMock,
    diff: diffMock,
    checkout: checkoutMock,
    merge: mergeMock,
    deleteLocalBranch: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue({ all: [] }),
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
            branch: 'contentrain/content/hero/homepage/20260314-120000',
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
      branch: 'contentrain/content/hero/homepage/20260314-120000',
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
      branches: [{ name: 'contentrain/review/hero/en/123', current: false }],
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

  it('diffs review branches against the configured default branch, not the current branch', async () => {
    await writeFile(join(testDir, '.contentrain', 'config.json'), JSON.stringify({
      version: 1,
      repository: { default_branch: 'main' },
    }, null, 2))
    branchLocalMock.mockReset()
    branchLocalMock.mockResolvedValue({
      current: 'feature/redesign',
      all: ['main', 'feature/redesign', 'contentrain/review/hero/en/123'],
    })

    await boot()

    const handler = routes.get('/api/branches/diff')
    await handler?.({
      query: { name: 'contentrain/review/hero/en/123' },
    })

    expect(diffMock).toHaveBeenCalledWith(['main...contentrain/review/hero/en/123', '--stat'])
  })

  it('checks out the configured base branch before approving a review branch', async () => {
    await writeFile(join(testDir, '.contentrain', 'config.json'), JSON.stringify({
      version: 1,
      repository: { default_branch: 'main' },
    }, null, 2))
    branchLocalMock.mockResolvedValueOnce({
      current: 'feature/redesign',
      all: ['main', 'feature/redesign', 'contentrain/review/hero/en/123'],
    })

    await boot()

    const handler = routes.get('/api/branches/approve')
    await handler?.({
      method: 'POST',
      body: { branch: 'contentrain/review/hero/en/123' },
    })

    expect(checkoutMock).toHaveBeenCalledWith('main')
    expect(mergeMock).toHaveBeenCalledWith(['contentrain/review/hero/en/123', '--no-edit', '-X', 'theirs'])
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
})
