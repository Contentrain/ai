import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { createServer } from '../../src/server.js'
import { TOOL_NAMES } from '../../src/tools/annotations.js'
import { MemoryProvider } from '../../src/testing/memory-provider.js'

/**
 * A remote session lists only the tools its provider can serve. The text it
 * shows must not send the agent to one of the others: a tool description, a
 * save response or a validate notice naming `contentrain_bulk` on a surface
 * without it is a dead end the agent cannot follow.
 */

const CONFIG = JSON.stringify({
  version: 1,
  stack: 'nuxt',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en'] },
  domains: ['system'],
})

const MODEL = JSON.stringify({
  id: 'posts',
  name: 'Posts',
  kind: 'collection',
  domain: 'system',
  i18n: true,
  fields: { title: { type: 'string', required: true } },
})

async function connect(provider: MemoryProvider): Promise<Client> {
  const server = createServer({ provider })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  return client
}

/** Every Contentrain tool name `text` mentions that `listed` does not contain. */
function unlistedMentions(text: string, listed: Set<string>): string[] {
  return TOOL_NAMES.filter(name => !listed.has(name) && new RegExp(`\\b${name}\\b`).test(text))
}

describe('remote session text names only listed tools', () => {
  it('server instructions, tool descriptions and input schemas', async () => {
    const client = await connect(new MemoryProvider({ files: { '.contentrain/config.json': CONFIG } }))
    const { tools } = await client.listTools()
    const listed = new Set(tools.map(t => t.name))
    expect(listed.has('contentrain_bulk')).toBe(false)

    const problems = [
      ...unlistedMentions(client.getInstructions() ?? '', listed).map(name => `server instructions name ${name}`),
      ...tools.flatMap(t =>
        unlistedMentions(JSON.stringify([t.description, t.inputSchema]), listed).map(name => `${t.name} names ${name}`)),
    ]
    expect(problems).toEqual([])
    await client.close()
  })

  it('a scheduled save and the drift notice from validate', async () => {
    const provider = new MemoryProvider({
      files: {
        '.contentrain/config.json': CONFIG,
        '.contentrain/models/posts.json': MODEL,
        '.contentrain/content/system/posts/en.json': JSON.stringify({ a1: { title: 'A' }, b2: { title: 'B' } }),
        '.contentrain/meta/posts/en.json': JSON.stringify({
          a1: { status: 'published', source: 'agent', updated_by: 'test' },
          b2: { status: 'draft', source: 'agent', updated_by: 'test' },
        }),
      },
    })
    const client = await connect(provider)
    const listed = new Set((await client.listTools()).tools.map(t => t.name))

    const save = await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'posts', entries: [{ id: 'c3', locale: 'en', data: { title: 'C' }, publish_at: '2026-08-01T00:00:00.000Z' }] },
    })
    const saveText = (save as { content: Array<{ text: string }> }).content[0]!.text
    expect(saveText).toContain('scheduling_note')
    expect(unlistedMentions(saveText, listed)).toEqual([])

    const validate = await client.callTool({ name: 'contentrain_validate', arguments: {} })
    const validateText = (validate as { content: Array<{ text: string }> }).content[0]!.text
    expect(validateText).toContain('Publish-state drift')
    expect(unlistedMentions(validateText, listed)).toEqual([])
    await client.close()
  })
})
