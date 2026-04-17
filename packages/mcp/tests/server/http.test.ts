import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startHttpMcpServer } from '../../src/server/http/index.js'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-http-mcp-'))
  const git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@contentrain.io')
  await writeFile(join(testDir, '.gitkeep'), '')
  await git.add('.')
  await git.commit('initial')
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

function parseResult(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ text: string }> }).content
  return JSON.parse(content[0]!.text) as Record<string, unknown>
}

describe('startHttpMcpServer', () => {
  it('serves contentrain_describe_format over HTTP end-to-end', async () => {
    const handle = await startHttpMcpServer({ projectRoot: testDir, port: 0 })
    try {
      const client = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await client.connect(transport)

      try {
        const result = await client.callTool({
          name: 'contentrain_describe_format',
          arguments: {},
        })
        const parsed = parseResult(result)
        expect(parsed['overview']).toBeDefined()
      } finally {
        await client.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('rejects tool calls without Bearer token when authToken is set', async () => {
    const handle = await startHttpMcpServer({ projectRoot: testDir, port: 0, authToken: 'secret' })
    try {
      const client = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))

      await expect(client.connect(transport)).rejects.toThrow()
    } finally {
      await handle.close()
    }
  })

  it('accepts tool calls with matching Bearer token', async () => {
    const handle = await startHttpMcpServer({ projectRoot: testDir, port: 0, authToken: 'secret' })
    try {
      const client = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url), {
        requestInit: { headers: { Authorization: 'Bearer secret' } },
      })
      await client.connect(transport)

      try {
        const result = await client.callTool({
          name: 'contentrain_describe_format',
          arguments: {},
        })
        expect(parseResult(result)['overview']).toBeDefined()
      } finally {
        await client.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('404s for requests outside the MCP mount path', async () => {
    const handle = await startHttpMcpServer({ projectRoot: testDir, port: 0 })
    try {
      const outsideUrl = handle.url.replace(/\/mcp$/, '/some-other-path')
      const response = await fetch(outsideUrl, { method: 'POST' })
      expect(response.status).toBe(404)
    } finally {
      await handle.close()
    }
  })

  // ─── Phase 5.3: provider threading ───
  // createServer now accepts `{ provider, projectRoot }` so HTTP handlers can
  // route to a non-local provider. Today the write path still needs
  // projectRoot; read-only static tools (describe_format) work regardless of
  // which provider is used. Phase 5.4 opens the write path to remote providers.

  it('serves describe_format when only a provider is configured (no projectRoot)', async () => {
    // Synthetic read-only provider — no projectRoot, implements the
    // minimum ToolProvider surface (RepoReader + capabilities). describe_format
    // must still succeed because it does not touch disk.
    const readOnlyProvider = {
      capabilities: {
        localWorktree: false,
        sourceRead: false,
        sourceWrite: false,
        pushRemote: false,
        branchProtection: false,
        pullRequestFallback: false,
        astScan: false,
      },
      async readFile() { throw new Error('no reads expected') },
      async listDirectory() { return [] },
      async fileExists() { return false },
    }

    const { startHttpMcpServerWith } = await import('../../src/server/http/index.js')
    const handle = await startHttpMcpServerWith({ provider: readOnlyProvider, port: 0 })
    try {
      const client = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await client.connect(transport)

      try {
        const result = await client.callTool({
          name: 'contentrain_describe_format',
          arguments: {},
        })
        const parsed = parseResult(result)
        expect(parsed['overview']).toBeDefined()
      } finally {
        await client.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('returns capability error for write tools when projectRoot is absent', async () => {
    const readOnlyProvider = {
      capabilities: {
        localWorktree: false,
        sourceRead: false,
        sourceWrite: false,
        pushRemote: false,
        branchProtection: false,
        pullRequestFallback: false,
        astScan: false,
      },
      async readFile() { throw new Error('no reads expected') },
      async listDirectory() { return [] },
      async fileExists() { return false },
    }

    const { startHttpMcpServerWith } = await import('../../src/server/http/index.js')
    const handle = await startHttpMcpServerWith({ provider: readOnlyProvider, port: 0 })
    try {
      const client = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await client.connect(transport)

      try {
        const result = await client.callTool({
          name: 'contentrain_status',
          arguments: {},
        })
        const parsed = parseResult(result)
        expect(parsed['capability_required']).toBe('localWorktree')
        expect(result.isError).toBe(true)
      } finally {
        await client.close()
      }
    } finally {
      await handle.close()
    }
  })
})
