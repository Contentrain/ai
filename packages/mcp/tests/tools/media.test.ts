import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * Media tools are a deterministic passthrough to the provider's media
 * facet. These tests drive them over a real MCP client against a stubbed
 * facet: inputs must arrive at the facet verbatim, outputs must come back
 * as structured JSON, and the tools must vanish when the facet is absent.
 */

const HERO_ASSET = {
  id: 'ast_1',
  path: 'media/original/hero.webp',
  url: 'https://cdn.example.com/proj/media/original/hero.webp',
  mime: 'image/webp',
  size: 51234,
  alt: 'Hero image',
  tags: ['landing'],
}

function makeMediaFacet() {
  return {
    list: vi.fn(async () => ({ assets: [HERO_ASSET], nextCursor: 'cur_2', total: 41 })),
    get: vi.fn(async (id: string) => (id === HERO_ASSET.id ? HERO_ASSET : null)),
    ingest: vi.fn(async () => HERO_ASSET),
    update: vi.fn(async () => ({ ...HERO_ASSET, alt: 'Updated' })),
    delete: vi.fn(async () => {}),
  }
}

function makeProvider(media?: ReturnType<typeof makeMediaFacet>) {
  return {
    capabilities: {
      localWorktree: false,
      sourceRead: false,
      sourceWrite: false,
      pushRemote: false,
      branchProtection: false,
      pullRequestFallback: false,
      astScan: false,
    },
    media,
    async readFile() { throw new Error('no reads expected') },
    async listDirectory() { return [] },
    async fileExists() { return false },
  }
}

async function connectedClient(media?: ReturnType<typeof makeMediaFacet>): Promise<Client> {
  const server = createServer({ provider: makeProvider(media) })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ])
  return client
}

function parseResult(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ text: string }> }).content
  return JSON.parse(content[0]!.text) as Record<string, unknown>
}

describe('contentrain_media_list', () => {
  it('passes filters through and returns assets with pagination', async () => {
    const media = makeMediaFacet()
    const client = await connectedClient(media)

    const result = await client.callTool({
      name: 'contentrain_media_list',
      arguments: { search: 'hero', tag: 'landing', limit: 10, cursor: 'cur_1' },
    })
    const data = parseResult(result)

    expect(media.list).toHaveBeenCalledWith({ search: 'hero', tag: 'landing', limit: 10, cursor: 'cur_1' })
    expect(data['assets']).toEqual([HERO_ASSET])
    expect(data['next_cursor']).toBe('cur_2')
    expect(data['total']).toBe(41)
    await client.close()
  })
})

describe('contentrain_media_get', () => {
  it('returns the asset by id', async () => {
    const media = makeMediaFacet()
    const client = await connectedClient(media)

    const result = await client.callTool({ name: 'contentrain_media_get', arguments: { id: 'ast_1' } })
    expect(parseResult(result)['asset']).toEqual(HERO_ASSET)
    await client.close()
  })

  it('errors with a hint for an unknown id', async () => {
    const client = await connectedClient(makeMediaFacet())

    const result = await client.callTool({ name: 'contentrain_media_get', arguments: { id: 'nope' } })
    expect(result.isError).toBe(true)
    const data = parseResult(result)
    expect(data['error']).toContain('not found')
    expect(data['hint']).toContain('contentrain_media_list')
    await client.close()
  })
})

describe('contentrain_media_ingest', () => {
  it('forwards the ingest input verbatim and reports the stored asset', async () => {
    const media = makeMediaFacet()
    const client = await connectedClient(media)

    const result = await client.callTool({
      name: 'contentrain_media_ingest',
      arguments: { url: 'https://example.com/hero.webp', filename: 'hero.webp', alt: 'Hero image', tags: ['landing'] },
    })
    const data = parseResult(result)

    expect(media.ingest).toHaveBeenCalledWith({
      url: 'https://example.com/hero.webp',
      filename: 'hero.webp',
      alt: 'Hero image',
      tags: ['landing'],
    })
    expect(data['status']).toBe('ingested')
    expect(data['asset']).toEqual(HERO_ASSET)
    await client.close()
  })

  it('rejects a non-URL source at the schema layer', async () => {
    const media = makeMediaFacet()
    const client = await connectedClient(media)

    const result = await client.callTool({
      name: 'contentrain_media_ingest',
      arguments: { url: 'not-a-url' },
    })
    expect(result.isError).toBe(true)
    expect(media.ingest).not.toHaveBeenCalled()
    await client.close()
  })

  it('surfaces provider policy rejections as structured errors', async () => {
    const media = makeMediaFacet()
    media.ingest.mockRejectedValueOnce(new Error('URL blocked by SSRF policy'))
    const client = await connectedClient(media)

    const result = await client.callTool({
      name: 'contentrain_media_ingest',
      arguments: { url: 'https://169.254.169.254/latest' },
    })
    expect(result.isError).toBe(true)
    const data = parseResult(result)
    expect(data['error']).toContain('SSRF policy')
    expect(data['stage']).toBe('media_ingest')
    await client.close()
  })
})

describe('contentrain_media_update', () => {
  it('splits id from the metadata patch', async () => {
    const media = makeMediaFacet()
    const client = await connectedClient(media)

    const result = await client.callTool({
      name: 'contentrain_media_update',
      arguments: { id: 'ast_1', alt: 'Updated', tags: ['landing', 'hero'] },
    })
    const data = parseResult(result)

    expect(media.update).toHaveBeenCalledWith('ast_1', { alt: 'Updated', tags: ['landing', 'hero'] })
    expect(data['status']).toBe('updated')
    expect((data['asset'] as Record<string, unknown>)['alt']).toBe('Updated')
    await client.close()
  })
})

describe('contentrain_media_delete', () => {
  it('requires confirm: true at the schema layer', async () => {
    const media = makeMediaFacet()
    const client = await connectedClient(media)

    const result = await client.callTool({ name: 'contentrain_media_delete', arguments: { id: 'ast_1' } })
    expect(result.isError).toBe(true)
    expect(media.delete).not.toHaveBeenCalled()
    await client.close()
  })

  it('deletes with confirmation and reports the id', async () => {
    const media = makeMediaFacet()
    const client = await connectedClient(media)

    const result = await client.callTool({
      name: 'contentrain_media_delete',
      arguments: { id: 'ast_1', confirm: true },
    })
    const data = parseResult(result)

    expect(media.delete).toHaveBeenCalledWith('ast_1')
    expect(data['status']).toBe('deleted')
    expect(data['id']).toBe('ast_1')
    await client.close()
  })
})

describe('registration without a media facet', () => {
  it('lists no media tools and rejects forced calls as unknown tools', async () => {
    const client = await connectedClient(undefined)

    const tools = await client.listTools()
    const mediaTools = tools.tools.filter(t => t.name.startsWith('contentrain_media_'))
    expect(mediaTools).toEqual([])

    const result = await client.callTool({ name: 'contentrain_media_list', arguments: {} })
    expect(result.isError).toBe(true)
    const text = (result.content as Array<{ text: string }>)[0]!.text
    expect(text).toMatch(/not found/i)
    await client.close()
  })
})
