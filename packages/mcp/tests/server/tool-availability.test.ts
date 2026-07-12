import { describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer, DEFAULT_INSTRUCTIONS, type CreateServerOptions } from '../../src/server.js'
import { TOOL_ANNOTATIONS, TOOL_NAMES } from '../../src/tools/annotations.js'
import { isToolAvailable, TOOL_REQUIREMENTS } from '../../src/tools/availability.js'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * Capability-aware registration: `createServer` consults TOOL_REQUIREMENTS
 * so `tools/list` only advertises tools that can succeed for the resolved
 * provider + projectRoot pair. Local flows keep the full 19-tool surface;
 * remote sessions see exactly the subset their provider supports.
 */

const ALL_CAPS_FALSE = {
  localWorktree: false,
  sourceRead: false,
  sourceWrite: false,
  pushRemote: false,
  branchProtection: false,
  pullRequestFallback: false,
  astScan: false,
}

function makeProvider(capabilities: Partial<typeof ALL_CAPS_FALSE> = {}) {
  return {
    capabilities: { ...ALL_CAPS_FALSE, ...capabilities },
    async readFile() { throw new Error('no reads expected') },
    async listDirectory() { return [] },
    async fileExists() { return false },
  }
}

async function connectedClient(input: string | CreateServerOptions): Promise<Client> {
  const server = createServer(input as CreateServerOptions)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ])
  return client
}

async function listedNames(client: Client): Promise<string[]> {
  const tools = await client.listTools()
  return tools.tools.map(t => t.name)
}

const REMOTE_SAFE_TOOLS = [
  'contentrain_status',
  'contentrain_describe',
  'contentrain_describe_format',
  'contentrain_model_save',
  'contentrain_model_delete',
  'contentrain_content_save',
  'contentrain_content_delete',
  'contentrain_content_list',
  'contentrain_validate',
]

describe('capability-aware tool registration', () => {
  it('registers all 19 tools for a local project root', async () => {
    const client = await connectedClient(join(tmpdir(), 'cr-availability-local'))
    const names = await listedNames(client)
    expect(names.toSorted()).toEqual([...TOOL_NAMES].toSorted())
    await client.close()
  })

  it('registers only remote-safe tools for a capability-less provider without projectRoot', async () => {
    const client = await connectedClient({ provider: makeProvider() })
    const names = await listedNames(client)
    expect(names.toSorted()).toEqual([...REMOTE_SAFE_TOOLS].toSorted())
    await client.close()
  })

  it('keeps validate listed remotely — read-only validate works over any provider', async () => {
    const client = await connectedClient({ provider: makeProvider() })
    const names = await listedNames(client)
    expect(names).toContain('contentrain_validate')
    await client.close()
  })

  it('gates on capability flags independently of projectRoot', async () => {
    // projectRoot present, but the provider only offers source access —
    // normalize tools appear, worktree/git lifecycle tools do not.
    const client = await connectedClient({
      provider: makeProvider({ sourceRead: true, sourceWrite: true, astScan: true }),
      projectRoot: join(tmpdir(), 'cr-availability-partial'),
    })
    const names = await listedNames(client)
    expect(names).toContain('contentrain_scan')
    expect(names).toContain('contentrain_apply')
    expect(names).toContain('contentrain_init')
    expect(names).not.toContain('contentrain_submit')
    expect(names).not.toContain('contentrain_merge')
    expect(names).not.toContain('contentrain_branch_list')
    expect(names).not.toContain('contentrain_branch_delete')
    await client.close()
  })

  it('every requirement entry names a real tool', () => {
    for (const name of Object.keys(TOOL_REQUIREMENTS)) {
      expect(TOOL_NAMES).toContain(name)
    }
  })

  it('isToolAvailable mirrors the requirements map', () => {
    const remote = makeProvider()
    expect(isToolAvailable('contentrain_status', remote, undefined)).toBe(true)
    expect(isToolAvailable('contentrain_doctor', remote, undefined)).toBe(false)
    expect(isToolAvailable('contentrain_doctor', remote, '/tmp/x')).toBe(true)
    expect(isToolAvailable('contentrain_submit', makeProvider({ localWorktree: true }), '/tmp/x')).toBe(false)
    expect(isToolAvailable('contentrain_submit', makeProvider({ localWorktree: true, pushRemote: true }), '/tmp/x')).toBe(true)
    expect(isToolAvailable('contentrain_scan', makeProvider({ astScan: true }), undefined)).toBe(false)
  })
})

describe('server instructions', () => {
  it('sends DEFAULT_INSTRUCTIONS when none are provided', async () => {
    expect(DEFAULT_INSTRUCTIONS.length).toBeLessThanOrEqual(512)
    const client = await connectedClient({ provider: makeProvider() })
    expect(client.getInstructions()).toBe(DEFAULT_INSTRUCTIONS)
    await client.close()
  })

  it('passes custom instructions through', async () => {
    const client = await connectedClient({
      provider: makeProvider(),
      instructions: 'Custom operating manual.',
    })
    expect(client.getInstructions()).toBe('Custom operating manual.')
    await client.close()
  })

  it('omits instructions entirely for an empty string', async () => {
    const client = await connectedClient({ provider: makeProvider(), instructions: '' })
    expect(client.getInstructions()).toBeUndefined()
    await client.close()
  })
})

describe('tool annotations', () => {
  it('every tool declares openWorldHint: false', () => {
    for (const [name, annotation] of Object.entries(TOOL_ANNOTATIONS)) {
      expect(annotation.openWorldHint, `${name} openWorldHint`).toBe(false)
    }
  })

  it('advertised tools carry openWorldHint over the wire', async () => {
    const client = await connectedClient({ provider: makeProvider() })
    const tools = await client.listTools()
    for (const tool of tools.tools) {
      expect(tool.annotations?.openWorldHint, `${tool.name} openWorldHint`).toBe(false)
    }
    await client.close()
  })
})
