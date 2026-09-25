import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer as createMcpServer } from '@contentrain/mcp/server'
import { createGit } from '@contentrain/mcp/git/identity'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'

// Real git (and one bare remote) per case; contends with the other git suites.
vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 })

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

// serve watches `.contentrain/` for the UI's live updates; nothing here needs it.
vi.mock('chokidar', () => ({
  watch: vi.fn(() => {
    const watcher = { on: vi.fn(() => watcher), close: vi.fn() }
    return watcher
  }),
}))

/**
 * #231 — `contentrain status` and the serve UI report the same base branch as
 * MCP's `contentrain_status`, i.e. the branch a local write actually advances.
 * Both CLI sites used to read `repository.default_branch ?? 'main'`, so a
 * `master`/`trunk` repo without config was compared against the wrong branch.
 */

const CONFIG = {
  version: 1,
  stack: 'other',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en'] },
  domains: ['marketing'],
}

let root: string
let template: string
const savedEnv = process.env['CONTENTRAIN_BRANCH']

beforeAll(async () => {
  delete process.env['CONTENTRAIN_BRANCH']
  root = await mkdtemp(join(tmpdir(), 'cr-cli-base-branch-'))
  template = join(root, 'template')
  await mkdir(join(template, '.contentrain'), { recursive: true })
  await writeFile(join(template, '.contentrain', 'config.json'), `${JSON.stringify(CONFIG, null, 2)}\n`)
  const git = createGit(template)
  await git.raw(['init', '--initial-branch=main'])
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  await git.add('.')
  await git.commit('initial')
  await git.raw(['branch', CONTENTRAIN_BRANCH])
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

afterEach(() => {
  if (savedEnv === undefined) delete process.env['CONTENTRAIN_BRANCH']
  else process.env['CONTENTRAIN_BRANCH'] = savedEnv
})

let caseCount = 0
async function project(): Promise<string> {
  const dir = join(root, `case-${++caseCount}`)
  await cp(template, dir, { recursive: true })
  return dir
}

async function cliStatusBase(dir: string): Promise<unknown> {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  try {
    const mod = await import('../../src/commands/status.js')
    await mod.default.run?.({ args: { root: dir, json: true }, rawArgs: [], cmd: mod.default } as never)
    const payload = JSON.parse(String(write.mock.calls.at(-1)?.[0] ?? '{}')) as { content_branch?: { base?: unknown } }
    return payload.content_branch?.base
  } finally {
    write.mockRestore()
  }
}

async function serveDefaultBranch(dir: string): Promise<unknown> {
  const { createServeApp } = await import('../../src/serve/server.js')
  const serve = await createServeApp({ projectRoot: dir, port: 0, uiDir: join(dir, 'no-ui') })
  const server: Server = createHttpServer(serve.toNodeListener())
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address() as AddressInfo
    const body = await (await fetch(`http://127.0.0.1:${port}/api/capabilities`)).json() as { defaultBranch?: unknown }
    return body.defaultBranch
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function mcpStatusBase(dir: string): Promise<unknown> {
  const server = createMcpServer(dir)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'base-branch-test', version: '1.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  try {
    const result = await client.callTool({ name: 'contentrain_status', arguments: {} })
    const text = (result.content as Array<{ type: string, text?: string }>).find(c => c.type === 'text')?.text ?? '{}'
    return (JSON.parse(text) as { content_branch?: { base?: unknown } }).content_branch?.base
  } finally {
    await client.close()
  }
}

async function expectAllReport(dir: string, expected: string): Promise<void> {
  const mcp = await mcpStatusBase(dir)
  expect(mcp).toBe(expected)
  expect(await cliStatusBase(dir)).toBe(mcp)
  expect(await serveDefaultBranch(dir)).toBe(mcp)
}

describe('CLI status and serve resolve the base branch like MCP (#231)', { sequential: true }, () => {
  it('config default_branch', async () => {
    const dir = await project()
    await createGit(dir).raw(['branch', 'trunk'])
    await writeFile(
      join(dir, '.contentrain', 'config.json'),
      `${JSON.stringify({ ...CONFIG, repository: { provider: 'github', owner: 'o', name: 'n', default_branch: 'trunk' } }, null, 2)}\n`,
    )
    await expectAllReport(dir, 'trunk')
  })

  it('CONTENTRAIN_BRANCH env', async () => {
    const dir = await project()
    await createGit(dir).raw(['branch', 'trunk'])
    process.env['CONTENTRAIN_BRANCH'] = 'trunk'
    await expectAllReport(dir, 'trunk')
  })

  it('origin/HEAD only — the remote default beats a local main', async () => {
    const dir = await project()
    const bare = join(root, `remote-${caseCount}.git`)
    await createGit(root).raw(['init', '--bare', bare])
    const git = createGit(dir)
    await git.raw(['branch', 'trunk'])
    await git.raw(['remote', 'add', 'origin', bare])
    await git.raw(['push', 'origin', 'main', 'trunk'])
    await git.raw(['remote', 'set-head', 'origin', 'trunk'])
    await expectAllReport(dir, 'trunk')
  })

  it('master only', async () => {
    const dir = await project()
    await createGit(dir).raw(['branch', '-m', 'main', 'master'])
    await expectAllReport(dir, 'master')
  })

  it('feature branch checked out — still the default branch, never the feature', async () => {
    const dir = await project()
    await createGit(dir).raw(['checkout', '-b', 'feat/redesign'])
    await expectAllReport(dir, 'main')
  })
})
