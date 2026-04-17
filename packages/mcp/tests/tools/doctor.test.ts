import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'
import { GitHubProvider } from '../../src/providers/github/provider.js'
import type { GitHubClient } from '../../src/providers/github/client.js'

const FIXTURE = join(import.meta.dirname, '..', 'fixtures')

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

async function createTestClient(projectRoot: string) {
  const server = createServer(projectRoot)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ])
  return client
}

let cleanupDirs: string[] = []

beforeEach(() => {
  cleanupDirs = []
})

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('contentrain_doctor tool', () => {
  it('returns a structured report over the fixture', async () => {
    const client = await createTestClient(FIXTURE)
    const result = await client.callTool({ name: 'contentrain_doctor', arguments: {} })

    const content = result.content as Array<{ type: string, text: string }>
    const report = JSON.parse(content[0]!.text)

    expect(report).toHaveProperty('checks')
    expect(report).toHaveProperty('summary')
    expect(Array.isArray(report.checks)).toBe(true)
    expect(report.summary).toMatchObject({
      total: expect.any(Number),
      passed: expect.any(Number),
      failed: expect.any(Number),
      warnings: expect.any(Number),
    })
    expect(report.summary.total).toBe(report.checks.length)
    expect(report.usage).toBeUndefined()
  })

  it('opts into usage analysis on { usage: true }', async () => {
    const client = await createTestClient(FIXTURE)
    const result = await client.callTool({
      name: 'contentrain_doctor',
      arguments: { usage: true },
    })

    const content = result.content as Array<{ type: string, text: string }>
    const report = JSON.parse(content[0]!.text)

    expect(report.usage).toBeDefined()
    expect(report.usage).toHaveProperty('unusedKeys')
    expect(report.usage).toHaveProperty('duplicateValues')
    expect(report.usage).toHaveProperty('missingLocaleKeys')
  })

  it('returns a capability error when driven by a remote provider (no projectRoot)', async () => {
    const fakeClient = {} as unknown as GitHubClient
    const provider = new GitHubProvider(fakeClient, { owner: 'acme', name: 'site' })
    const server = createServer({ provider })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ])

    const result = await client.callTool({ name: 'contentrain_doctor', arguments: {} })
    expect(result.isError).toBe(true)
    const content = result.content as Array<{ type: string, text: string }>
    const data = JSON.parse(content[0]!.text)
    expect(data.capability_required).toBe('localWorktree')
  })

  it('is advertised in the tools list', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'cr-doctor-advert-'))
    cleanupDirs.push(tmpDir)
    const client = await createTestClient(FIXTURE)
    const tools = await client.listTools()
    const doctor = tools.tools.find(t => t.name === 'contentrain_doctor')
    expect(doctor).toBeDefined()
    expect(doctor?.annotations?.readOnlyHint).toBe(true)
  })
})
