import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveProjectRootMock = vi.fn().mockResolvedValue('/test/project')
const mcpConnectMock = vi.fn().mockResolvedValue(undefined)
const createServeAppMock = vi.fn().mockResolvedValue({
  app: {},
  handleUpgrade: vi.fn(),
})
const infoMock = vi.fn()
const warnMock = vi.fn()
const boxMock = vi.fn()
const httpOnMock = vi.fn()
const httpListenMock = vi.fn((_port, _host, cb?: () => void) => cb?.())
const execMock = vi.fn()
const listConfigMock = vi.fn().mockResolvedValue({
  all: { 'user.name': 'Test User', 'user.email': 'test@example.com' },
})

vi.mock('../../src/utils/context.js', () => ({
  resolveProjectRoot: resolveProjectRootMock,
}))

vi.mock('@contentrain/mcp/server', () => ({
  createServer: vi.fn(() => ({ connect: mcpConnectMock })),
}))

vi.mock('../../src/serve/server.js', () => ({
  createServeApp: createServeAppMock,
}))

vi.mock('consola', () => ({
  default: {
    info: infoMock,
    warn: warnMock,
    box: boxMock,
  },
}))

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    listConfig: listConfigMock,
  })),
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(function StdioServerTransport() {}),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn((path: string) => path.endsWith('/serve-ui')),
}))

vi.mock('node:http', () => ({
  createServer: vi.fn(() => ({
    on: httpOnMock,
    listen: httpListenMock,
  })),
}))

vi.mock('h3', () => ({
  toNodeListener: vi.fn(() => vi.fn()),
}))

vi.mock('node:child_process', () => ({
  exec: execMock,
}))

describe('serve command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CONTENTRAIN_PROJECT_ROOT = ''
    process.env.CONTENTRAIN_SOURCE = ''
    process.env.CONTENTRAIN_AUTHOR_NAME = ''
    process.env.CONTENTRAIN_AUTHOR_EMAIL = ''
  })

  it('module loads with expected args', async () => {
    const mod = await import('../../src/commands/serve.js')
    expect(mod.default.meta?.name).toBe('serve')
    expect(mod.default.args?.stdio?.type).toBe('boolean')
    expect(mod.default.args?.port?.type).toBe('string')
    expect(mod.default.args?.host?.type).toBe('string')
    expect(mod.default.args?.open?.type).toBe('boolean')
  })

  it('runs MCP stdio mode without starting the web UI', async () => {
    const mod = await import('../../src/commands/serve.js')
    await mod.default.run?.({ args: { stdio: true, root: '/test/project' } })

    expect(resolveProjectRootMock).toHaveBeenCalledWith('/test/project')
    expect(mcpConnectMock).toHaveBeenCalledTimes(1)
    expect(createServeAppMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalledWith(expect.stringContaining('stdio'))
    expect(process.env.CONTENTRAIN_PROJECT_ROOT).toBe('/test/project')
    expect(process.env.CONTENTRAIN_SOURCE).toBe('mcp-local')
    expect(process.env.CONTENTRAIN_AUTHOR_NAME).toBe('Test User')
    expect(process.env.CONTENTRAIN_AUTHOR_EMAIL).toBe('test@example.com')
  })

  it('starts the web UI server with derived options and does not auto-open when disabled', async () => {
    const mod = await import('../../src/commands/serve.js')
    await mod.default.run?.({
      args: { root: '/test/project', port: '4444', host: '0.0.0.0', open: false },
    })

    expect(createServeAppMock).toHaveBeenCalledWith(expect.objectContaining({
      projectRoot: '/test/project',
      port: 4444,
      uiDir: expect.stringContaining('serve-ui'),
    }))
    expect(httpOnMock).toHaveBeenCalledWith('upgrade', expect.any(Function))
    expect(boxMock).toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('network'))
    expect(execMock).not.toHaveBeenCalled()
  })
})
