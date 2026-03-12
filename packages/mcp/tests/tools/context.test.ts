import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'

const FIXTURE = join(import.meta.dirname, '..', 'fixtures')

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

describe('contentrain_status', () => {
  it('returns initialized:true for valid fixture', async () => {
    const client = await createTestClient(FIXTURE)
    const result = await client.callTool({ name: 'contentrain_status', arguments: {} })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.initialized).toBe(true)
    expect(data.config.stack).toBe('nuxt')
    expect(data.config.workflow).toBe('review')
    expect(data.config.locales.default).toBe('en')
    expect(data.models).toHaveLength(3)
    expect(data.vocabulary_size).toBe(2)
    expect(data.context).not.toBeNull()
    expect(data.context.lastOperation.tool).toBe('content_save')

    // models should be sorted by id
    const ids = data.models.map((m: { id: string }) => m.id)
    expect(ids).toEqual(['blog-post', 'error-messages', 'hero'])
  })

  it('returns initialized:false for empty directory', async () => {
    const client = await createTestClient('/tmp/nonexistent-contentrain-test')
    const result = await client.callTool({ name: 'contentrain_status', arguments: {} })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.initialized).toBe(false)
    expect(data.next_steps).toContain('Run contentrain_init')
  })

  it('returns model summaries with field counts', async () => {
    const client = await createTestClient(FIXTURE)
    const result = await client.callTool({ name: 'contentrain_status', arguments: {} })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    const hero = data.models.find((m: { id: string }) => m.id === 'hero')
    expect(hero.kind).toBe('singleton')
    expect(hero.fields).toBe(5)

    const dict = data.models.find((m: { id: string }) => m.id === 'error-messages')
    expect(dict.kind).toBe('dictionary')
    expect(dict.fields).toBe(0)
  })
})

describe('contentrain_describe', () => {
  it('returns full model schema', async () => {
    const client = await createTestClient(FIXTURE)
    const result = await client.callTool({
      name: 'contentrain_describe',
      arguments: { model: 'hero' },
    })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.id).toBe('hero')
    expect(data.name).toBe('Hero Section')
    expect(data.kind).toBe('singleton')
    expect(data.domain).toBe('marketing')
    expect(data.i18n).toBe(true)
    expect(data.fields.title.type).toBe('string')
    expect(data.fields.title.required).toBe(true)
  })

  it('includes sample when requested', async () => {
    const client = await createTestClient(FIXTURE)
    const result = await client.callTool({
      name: 'contentrain_describe',
      arguments: { model: 'hero', include_sample: true, locale: 'en' },
    })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.sample).toBeDefined()
    expect(data.sample.title).toBe('Build faster with Contentrain')
  })

  it('returns stats with locale counts', async () => {
    const client = await createTestClient(FIXTURE)
    const result = await client.callTool({
      name: 'contentrain_describe',
      arguments: { model: 'hero' },
    })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.stats.locales.en).toBe(1)
    expect(data.stats.locales.tr).toBe(1)
  })

  it('returns import snippet for nuxt stack', async () => {
    const client = await createTestClient(FIXTURE)
    const result = await client.callTool({
      name: 'contentrain_describe',
      arguments: { model: 'hero' },
    })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.import_snippet.nuxt).toBeDefined()
    expect(data.import_snippet.generic).toBeDefined()
  })

  it('returns error for unknown model', async () => {
    const client = await createTestClient(FIXTURE)
    const result = await client.callTool({
      name: 'contentrain_describe',
      arguments: { model: 'nonexistent' },
    })

    expect(result.isError).toBe(true)
    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)
    expect(data.error).toContain('nonexistent')
  })
})
