import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { createServer } from '../../src/server.js'
import { MemoryProvider } from '../../src/testing/memory-provider.js'

/**
 * contentrain_content_list with resolve:true on a session with no project root
 * — the shape a hosted server (the Studio connector) has. It used to throw
 * "requires local filesystem access", so a remote agent could never read a
 * post's author or guide, only their ids.
 */

const CONFIG = JSON.stringify({
  version: 1,
  stack: 'astro',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['blog'],
})

const model = (def: Record<string, unknown>) => JSON.stringify({ domain: 'blog', i18n: true, ...def })

function seeded(): MemoryProvider {
  return new MemoryProvider({
    files: {
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/posts.json': model({
        id: 'posts',
        name: 'Posts',
        kind: 'collection',
        title_field: 'title',
        fields: {
          title: { type: 'string', required: true },
          author: { type: 'relation', model: 'authors' },
          tags: { type: 'relations', model: 'tags' },
          guide: { type: 'relation', model: 'guides' },
        },
      }),
      '.contentrain/models/authors.json': model({ id: 'authors', name: 'Authors', kind: 'collection', title_field: 'name', fields: { name: { type: 'string' } } }),
      '.contentrain/models/tags.json': model({ id: 'tags', name: 'Tags', kind: 'collection', i18n: false, title_field: 'label', fields: { label: { type: 'string' } } }),
      '.contentrain/models/guides.json': model({ id: 'guides', name: 'Guides', kind: 'document', title_field: 'title', fields: { title: { type: 'string' } } }),
      '.contentrain/content/blog/posts/en.json': JSON.stringify({
        p1: { title: 'Hello', author: 'a1', tags: ['t1', 'gone'], guide: 'intro' },
      }),
      '.contentrain/content/blog/authors/en.json': JSON.stringify({ a1: { name: 'Alice' } }),
      '.contentrain/content/blog/tags/data.json': JSON.stringify({ t1: { label: 'News' } }),
      '.contentrain/content/blog/guides/intro/en.md': '---\ntitle: Getting started\n---\nRead me.\n',
    },
  })
}

async function connect(provider: MemoryProvider): Promise<Client> {
  const server = createServer({ provider })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  return client
}

describe('contentrain_content_list resolve:true through a provider', () => {
  it('hydrates relation, relations and a document target the way the local path does', async () => {
    const client = await connect(seeded())
    const res = await client.callTool({
      name: 'contentrain_content_list',
      arguments: { model: 'posts', locale: 'en', resolve: true },
    }) as { content: Array<{ text: string }>, isError?: boolean }

    expect(res.isError).not.toBe(true)
    const data = JSON.parse(res.content[0]!.text) as { data: Array<Record<string, unknown>> }
    const post = data.data[0]!
    expect(post['author']).toEqual({ id: 'a1', name: 'Alice' })
    // A missing target id stays an id, as on the local path.
    expect(post['tags']).toEqual([{ id: 't1', label: 'News' }, 'gone'])
    expect(post['guide']).toEqual({ id: 'intro', slug: 'intro', title: 'Getting started', body: 'Read me.' })
  })
})
