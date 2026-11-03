import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { createServer } from '../../src/server.js'
import { MemoryProvider } from '../../src/testing/memory-provider.js'

/**
 * contentrain_content_status on a session with no project root — the shape a
 * hosted server has. Before it existed, a remote agent could create entries
 * (as drafts) and never publish them: the only status path was
 * contentrain_bulk, which needs a local worktree.
 */

const CONFIG = JSON.stringify({
  version: 1,
  stack: 'nuxt',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['blog'],
})

const POSTS = JSON.stringify({
  id: 'posts',
  name: 'Posts',
  kind: 'collection',
  domain: 'blog',
  i18n: true,
  title_field: 'title',
  fields: { title: { type: 'string', required: true } },
})

const GUIDES = JSON.stringify({
  id: 'guides',
  name: 'Guides',
  kind: 'document',
  domain: 'blog',
  i18n: true,
  title_field: 'title',
  fields: { title: { type: 'string', required: true } },
})

const HERO = JSON.stringify({
  id: 'hero',
  name: 'Hero',
  kind: 'singleton',
  domain: 'blog',
  i18n: false,
  title_field: 'headline',
  fields: { headline: { type: 'string' } },
})

function seeded(extra: Record<string, string> = {}, capabilities?: { localWorktree: boolean }): MemoryProvider {
  return new MemoryProvider({
    files: {
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/posts.json': POSTS,
      '.contentrain/models/guides.json': GUIDES,
      '.contentrain/models/hero.json': HERO,
      ...extra,
    },
    ...(capabilities ? { capabilities } : {}),
  })
}

async function connect(provider: MemoryProvider): Promise<Client> {
  const server = createServer({ provider })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  return client
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args }) as { content: Array<{ text: string }>, isError?: boolean }
  return { data: JSON.parse(res.content[0]!.text) as Record<string, unknown>, isError: res.isError === true }
}

function metaOf(provider: MemoryProvider, path: string, ref?: string): Record<string, unknown> {
  return JSON.parse(provider.snapshot(ref)[path]!) as Record<string, unknown>
}

describe('contentrain_content_status on a remote session', () => {
  it('save a draft, publish it, and the list shows it published', async () => {
    const provider = seeded()
    const client = await connect(provider)

    const save = await call(client, 'contentrain_content_save', {
      model: 'posts',
      entries: [{ id: 'p1', locale: 'en', data: { title: 'Hello' } }],
    })
    expect(save.isError).toBe(false)

    const before = await call(client, 'contentrain_content_list', { model: 'posts', locale: 'en' })
    expect((before.data['data'] as Array<Record<string, unknown>>)[0]!['meta']).toEqual({ status: 'draft' })

    const publish = await call(client, 'contentrain_content_status', {
      model: 'posts', entry_ids: ['p1'], locale: 'en', status: 'published',
    })
    expect(publish.isError).toBe(false)
    expect(publish.data['status']).toBe('committed')
    expect(publish.data['changes']).toEqual([{ id: 'p1', locale: 'en', from: 'draft', to: 'published' }])
    expect(publish.data['validation']).toEqual({ valid: true, errors: [] })
    expect((publish.data['git'] as Record<string, unknown>)['branch']).toMatch(/^cr\/status\/posts\/en\//)

    const after = await call(client, 'contentrain_content_list', { model: 'posts', locale: 'en' })
    const entry = (after.data['data'] as Array<Record<string, unknown>>)[0]!
    expect(entry['id']).toBe('p1')
    expect(entry['title']).toBe('Hello')
    expect(entry['meta']).toEqual({ status: 'published' })
    await client.close()
  })

  it('a hosted provider commits the change for review instead of landing it', async () => {
    const provider = seeded({
      '.contentrain/content/blog/posts/en.json': JSON.stringify({ p1: { title: 'Hello' } }),
      '.contentrain/meta/posts/en.json': JSON.stringify({ p1: { status: 'draft', source: 'agent', updated_by: 'test' } }),
    }, { localWorktree: false })
    const client = await connect(provider)

    const publish = await call(client, 'contentrain_content_status', {
      model: 'posts', entry_ids: ['p1'], locale: 'en', status: 'published',
    })
    expect(publish.isError).toBe(false)
    const git = publish.data['git'] as Record<string, unknown>
    expect(git['action']).toBe('pending-review')

    const branch = git['branch'] as string
    expect((metaOf(provider, '.contentrain/meta/posts/en.json', branch)['p1'] as Record<string, unknown>)['status']).toBe('published')
    expect((metaOf(provider, '.contentrain/meta/posts/en.json')['p1'] as Record<string, unknown>)['status']).toBe('draft')
    await client.close()
  })

  it('refuses to publish an entry that fails validation, and commits nothing', async () => {
    const provider = seeded({
      '.contentrain/content/blog/posts/en.json': JSON.stringify({ p1: { title: '' }, p2: { title: 'Fine' } }),
      '.contentrain/meta/posts/en.json': JSON.stringify({
        p1: { status: 'draft', source: 'agent', updated_by: 'test' },
        p2: { status: 'draft', source: 'agent', updated_by: 'test' },
      }),
    })
    const client = await connect(provider)
    const commitsBefore = provider.commits.length

    const res = await call(client, 'contentrain_content_status', {
      model: 'posts', entry_ids: ['p1', 'p2'], locale: 'en', status: 'published',
    })
    expect(res.isError).toBe(true)
    expect(res.data['error']).toContain('nothing was published')
    expect((res.data['issues'] as Array<Record<string, string>>).map(i => i['entry'])).toEqual(['p1'])
    expect(provider.commits.length).toBe(commitsBefore)
    expect((metaOf(provider, '.contentrain/meta/posts/en.json')['p2'] as Record<string, unknown>)['status']).toBe('draft')

    // Unpublishing never needs a valid entry.
    const archive = await call(client, 'contentrain_content_status', {
      model: 'posts', entry_ids: ['p1'], locale: 'en', status: 'archived',
    })
    expect(archive.isError).toBe(false)
    expect(archive.data['changes']).toEqual([{ id: 'p1', locale: 'en', from: 'draft', to: 'archived' }])
    await client.close()
  })

  it('reports unchanged and not_found, and a repeat commits nothing', async () => {
    const provider = seeded({
      '.contentrain/content/blog/posts/en.json': JSON.stringify({ p1: { title: 'A' }, p2: { title: 'B' } }),
      '.contentrain/meta/posts/en.json': JSON.stringify({
        p1: { status: 'published', source: 'agent', updated_by: 'test' },
        p2: { status: 'draft', source: 'agent', updated_by: 'test' },
      }),
    })
    const client = await connect(provider)

    const first = await call(client, 'contentrain_content_status', {
      model: 'posts', entry_ids: ['p1', 'p2', 'missing'], locale: 'en', status: 'published',
    })
    expect(first.isError).toBe(false)
    expect(first.data['changes']).toEqual([{ id: 'p2', locale: 'en', from: 'draft', to: 'published' }])
    expect(first.data['unchanged']).toEqual([{ id: 'p1', locale: 'en', status: 'published' }])
    expect(first.data['not_found']).toEqual(['missing'])

    const commitsBefore = provider.commits.length
    const repeat = await call(client, 'contentrain_content_status', {
      model: 'posts', entry_ids: ['p1', 'p2'], locale: 'en', status: 'published',
    })
    expect(repeat.isError).toBe(false)
    expect(repeat.data['status']).toBe('unchanged')
    expect(repeat.data['changes']).toEqual([])
    expect(provider.commits.length).toBe(commitsBefore)

    const none = await call(client, 'contentrain_content_status', {
      model: 'posts', entry_ids: ['nope'], status: 'published',
    })
    expect(none.isError).toBe(true)
    expect(none.data['not_found']).toEqual(['nope'])
    await client.close()
  })

  it('addresses documents by slug and singletons by locale alone', async () => {
    const provider = seeded({
      '.contentrain/content/blog/guides/intro/en.md': '---\ntitle: Intro\nslug: intro\n---\nBody\n',
      '.contentrain/content/blog/guides/intro/tr.md': '---\ntitle: Giriş\nslug: intro\n---\nGövde\n',
      '.contentrain/meta/guides/intro/en.json': JSON.stringify({ status: 'draft', source: 'agent', updated_by: 'test' }),
      '.contentrain/meta/guides/intro/tr.json': JSON.stringify({ status: 'draft', source: 'agent', updated_by: 'test' }),
      '.contentrain/content/blog/hero/data.json': JSON.stringify({ headline: 'Hi' }),
      '.contentrain/meta/hero/en.json': JSON.stringify({ status: 'draft', source: 'agent', updated_by: 'test' }),
    })
    const client = await connect(provider)

    const doc = await call(client, 'contentrain_content_status', { model: 'guides', slugs: ['intro'], locale: 'tr', status: 'published' })
    expect(doc.data['changes']).toEqual([{ slug: 'intro', locale: 'tr', from: 'draft', to: 'published' }])
    expect(metaOf(provider, '.contentrain/meta/guides/intro/en.json')['status']).toBe('draft')

    const docs = await call(client, 'contentrain_content_list', { model: 'guides', locale: 'tr' })
    expect((docs.data['data'] as Array<Record<string, unknown>>)[0]!['meta']).toEqual({ status: 'published' })

    const wrongKey = await call(client, 'contentrain_content_status', { model: 'guides', entry_ids: ['intro'], status: 'published' })
    expect(wrongKey.isError).toBe(true)
    expect(wrongKey.data['error']).toContain('keyed by slug')

    // Non-i18n: one meta record at the default locale, whatever is supported.
    const hero = await call(client, 'contentrain_content_status', { model: 'hero', status: 'published' })
    expect(hero.data['changes']).toEqual([{ locale: 'en', from: 'draft', to: 'published' }])
    const heroList = await call(client, 'contentrain_content_list', { model: 'hero' })
    expect(heroList.data['meta']).toEqual({ status: 'published' })
    await client.close()
  })

  it('stops at a blocked write-readiness gate', async () => {
    const provider = seeded({
      '.contentrain/content/blog/posts/en.json': JSON.stringify({ p1: { title: 'A' } }),
      '.contentrain/meta/posts/en.json': JSON.stringify({ p1: { status: 'draft', source: 'agent', updated_by: 'test' } }),
    })
    provider.setWriteReadiness({ blocked: true, message: 'Too many unmerged branches' })
    const client = await connect(provider)
    const res = await call(client, 'contentrain_content_status', { model: 'posts', entry_ids: ['p1'], status: 'published' })
    expect(res.isError).toBe(true)
    expect(res.data['action']).toBe('blocked')
    expect(provider.commits.length).toBe(0)
    await client.close()
  })
})
