import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'
import { readJson, readText } from '../../src/util/fs.js'

let testDir: string
let client: Client

async function initProject(dir: string): Promise<void> {
  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  await writeFile(join(dir, '.gitkeep'), '')
  await git.add('.')
  await git.commit('initial')
}

async function createTestClient(projectRoot: string): Promise<Client> {
  const server = createServer(projectRoot)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const c = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([
    c.connect(clientTransport),
    server.connect(serverTransport),
  ])

  return c
}

function parseResult(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ text: string }> }).content
  return JSON.parse(content[0]!.text) as Record<string, unknown>
}

async function createModel(
  c: Client,
  id: string,
  kind: string,
  domain: string,
  fields?: Record<string, unknown>,
): Promise<Client> {
  await c.callTool({
    name: 'contentrain_model_save',
    arguments: {
      id,
      name: id,
      kind,
      domain,
      i18n: true,
      fields,
    },
  })
  return createTestClient(testDir)
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-content-tool-test-'))
  await initProject(testDir)
  client = await createTestClient(testDir)

  // Initialize project with en + tr locales for i18n tests
  await client.callTool({ name: 'contentrain_init', arguments: { locales: ['en', 'tr'] } })
  client = await createTestClient(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('contentrain_content_save', () => {
  it('saves singleton content for en + tr', async () => {
    client = await createModel(client, 'hero', 'singleton', 'marketing', {
      title: { type: 'string', required: true },
      subtitle: { type: 'text' },
    })

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'hero',
        entries: [
          { locale: 'en', data: { title: 'Hello', subtitle: 'World' } },
          { locale: 'tr', data: { title: 'Merhaba', subtitle: 'Dünya' } },
        ],
      },
    })

    const data = parseResult(result)
    const results = data['results'] as Array<Record<string, unknown>>
    expect(results).toHaveLength(2)
    expect(results[0]!['locale']).toBe('en')
    expect(results[1]!['locale']).toBe('tr')

    const git = data['git'] as Record<string, unknown>
    expect(git['action']).toBe('auto-merged')
    expect(data['context_updated']).toBe(true)

    // Verify on disk
    const en = await readJson<Record<string, unknown>>(
      join(testDir, '.contentrain', 'content', 'marketing', 'hero', 'en.json'),
    )
    expect(en!['title']).toBe('Hello')

    // Verify meta written
    const meta = await readJson<Record<string, unknown>>(
      join(testDir, '.contentrain', 'meta', 'hero', 'en.json'),
    )
    expect(meta!['status']).toBe('draft')
    expect(meta!['source']).toBe('agent')

    // Verify contentrain branch exists after content save
    const branches = await simpleGit(testDir).branchLocal()
    expect(branches.all).toContain('contentrain')
  })

  it('saves collection entries with auto-generated IDs', async () => {
    client = await createModel(client, 'authors', 'collection', 'blog', {
      name: { type: 'string', required: true },
      bio: { type: 'text' },
    })

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [
          { locale: 'en', data: { name: 'Alice', bio: 'Developer' } },
          { locale: 'en', data: { name: 'Bob', bio: 'Writer' } },
        ],
      },
    })

    const data = parseResult(result)
    const results = data['results'] as Array<Record<string, unknown>>
    expect(results).toHaveLength(2)
    expect(results[0]!['action']).toBe('created')
    expect(results[0]!['id']).toBeDefined()
    expect((results[0]!['id'] as string).length).toBe(12)

    // Verify object-map is sorted
    const content = await readJson<Record<string, unknown>>(
      join(testDir, '.contentrain', 'content', 'blog', 'authors', 'en.json'),
    )
    const keys = Object.keys(content!)
    expect(keys).toEqual([...keys].toSorted())
  })

  it('updates existing collection entry', async () => {
    client = await createModel(client, 'authors', 'collection', 'blog', {
      name: { type: 'string', required: true },
    })

    // Create
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [{ id: 'test-id-001', locale: 'en', data: { name: 'Original' } }],
      },
    })

    client = await createTestClient(testDir)

    // Update
    const updateResult = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [{ id: 'test-id-001', locale: 'en', data: { name: 'Updated' } }],
      },
    })

    const data = parseResult(updateResult)
    const results = data['results'] as Array<Record<string, unknown>>
    expect(results[0]!['action']).toBe('updated')

    const content = await readJson<Record<string, Record<string, unknown>>>(
      join(testDir, '.contentrain', 'content', 'blog', 'authors', 'en.json'),
    )
    expect(content!['test-id-001']!['name']).toBe('Updated')
  })

  it('saves document with frontmatter + body', async () => {
    client = await createModel(client, 'blog-post', 'document', 'blog', {
      title: { type: 'string', required: true },
      slug: { type: 'slug', required: true },
      tags: { type: 'array', items: 'string' },
    })

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'blog-post',
        entries: [{
          slug: 'getting-started',
          locale: 'en',
          data: {
            title: 'Getting Started',
            slug: 'getting-started',
            tags: ['tutorial', 'guide'],
            body: '# Getting Started\n\nWelcome to Contentrain.',
          },
        }],
      },
    })

    const data = parseResult(result)
    const results = data['results'] as Array<Record<string, unknown>>
    expect(results[0]!['action']).toBe('created')
    expect(results[0]!['slug']).toBe('getting-started')

    // Verify markdown file
    const raw = await readText(
      join(testDir, '.contentrain', 'content', 'blog', 'blog-post', 'getting-started', 'en.md'),
    )
    expect(raw).toContain('title: Getting Started')
    expect(raw).toContain('slug: getting-started')
    expect(raw).toContain('  - tutorial')
    expect(raw).toContain('# Getting Started')
    expect(raw).toContain('Welcome to Contentrain.')
  })

  it('saves dictionary key-value pairs', async () => {
    client = await createModel(client, 'error-messages', 'dictionary', 'system')

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'error-messages',
        entries: [{
          locale: 'en',
          data: { 'auth.forbidden': 'Access denied', 'auth.expired': 'Session expired' },
        }],
      },
    })

    const data = parseResult(result)
    const results = data['results'] as Array<Record<string, unknown>>
    expect(results[0]!['action']).toBe('updated')

    const content = await readJson<Record<string, string>>(
      join(testDir, '.contentrain', 'content', 'system', 'error-messages', 'en.json'),
    )
    expect(content!['auth.forbidden']).toBe('Access denied')
  })

  it('returns error for unknown model', async () => {
    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'nonexistent',
        entries: [{ data: { foo: 'bar' } }],
      },
    })

    expect(result.isError).toBe(true)
    const data = parseResult(result)
    expect(data['error']).toContain('not found')
  })

  it('blocks new writes when 80 active contentrain branches exist', async () => {
    client = await createModel(client, 'hero', 'singleton', 'marketing', {
      title: { type: 'string', required: true },
    })

    const git = simpleGit(testDir)
    const baseBranch = (await git.raw(['branch', '--show-current'])).trim()

    for (let i = 1; i <= 80; i++) {
      const branchName = `cr/test/block-${String(i).padStart(3, '0')}`
      await git.checkoutBranch(branchName, baseBranch)
      await git.commit(`branch ${i}`, undefined, { '--allow-empty': null })
      await git.checkout(baseBranch)
    }

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'hero',
        entries: [{ locale: 'en', data: { title: 'Blocked write' } }],
      },
    })

    expect(result.isError).toBe(true)
    const data = parseResult(result)
    expect(data['error']).toContain('80')
  }, 120000)

  it('handles two writes to the same model in the same second without branch collision', async () => {
    client = await createModel(client, 'hero', 'singleton', 'marketing', {
      title: { type: 'string', required: true },
    })

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    try {
      const first = await client.callTool({
        name: 'contentrain_content_save',
        arguments: {
          model: 'hero',
          entries: [{ locale: 'en', data: { title: 'First write' } }],
        },
      })

      expect(first.isError).not.toBe(true)

      client = await createTestClient(testDir)

      const second = await client.callTool({
        name: 'contentrain_content_save',
        arguments: {
          model: 'hero',
          entries: [{ locale: 'en', data: { title: 'Second write' } }],
        },
      })

      expect(second.isError).not.toBe(true)
    } finally {
      nowSpy.mockRestore()
    }
  })
})

describe('contentrain_content_delete', () => {
  it('deletes collection entry from object-map', async () => {
    client = await createModel(client, 'authors', 'collection', 'blog', {
      name: { type: 'string' },
    })

    // Create two entries
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [
          { id: 'keep-me', locale: 'en', data: { name: 'Keeper' } },
          { id: 'delete-me', locale: 'en', data: { name: 'Goner' } },
        ],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_content_delete',
      arguments: { model: 'authors', id: 'delete-me', locale: 'en', confirm: true },
    })

    const data = parseResult(result)
    expect(data['deleted']).toBe(true)

    const content = await readJson<Record<string, unknown>>(
      join(testDir, '.contentrain', 'content', 'blog', 'authors', 'en.json'),
    )
    expect(content!['keep-me']).toBeDefined()
    expect(content!['delete-me']).toBeUndefined()
  })

  it('deletes collection entry metadata across all locales when locale is omitted', async () => {
    client = await createModel(client, 'authors', 'collection', 'blog', {
      name: { type: 'string' },
    })

    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [
          { id: 'delete-me', locale: 'en', data: { name: 'English' } },
          { id: 'delete-me', locale: 'tr', data: { name: 'Turkce' } },
        ],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_content_delete',
      arguments: { model: 'authors', id: 'delete-me', confirm: true },
    })

    const data = parseResult(result)
    expect(data['deleted']).toBe(true)

    const enContent = await readJson<Record<string, unknown>>(
      join(testDir, '.contentrain', 'content', 'blog', 'authors', 'en.json'),
    )
    const trContent = await readJson<Record<string, unknown>>(
      join(testDir, '.contentrain', 'content', 'blog', 'authors', 'tr.json'),
    )
    expect(enContent!['delete-me']).toBeUndefined()
    expect(trContent!['delete-me']).toBeUndefined()

    const enMeta = await readJson<Record<string, unknown>>(
      join(testDir, '.contentrain', 'meta', 'authors', 'en.json'),
    )
    const trMeta = await readJson<Record<string, unknown>>(
      join(testDir, '.contentrain', 'meta', 'authors', 'tr.json'),
    )
    expect(enMeta?.['delete-me']).toBeUndefined()
    expect(trMeta?.['delete-me']).toBeUndefined()
  })

  it('deletes document slug directory', async () => {
    client = await createModel(client, 'blog-post', 'document', 'blog', {
      title: { type: 'string' },
      slug: { type: 'slug' },
    })

    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'blog-post',
        entries: [{
          slug: 'to-delete',
          locale: 'en',
          data: { title: 'Delete Me', slug: 'to-delete', body: '# Gone' },
        }],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_content_delete',
      arguments: { model: 'blog-post', slug: 'to-delete', confirm: true },
    })

    const data = parseResult(result)
    expect(data['deleted']).toBe(true)

    const raw = await readText(
      join(testDir, '.contentrain', 'content', 'blog', 'blog-post', 'to-delete', 'en.md'),
    )
    expect(raw).toBeNull()
  })
})

describe('contentrain_content_list', () => {
  it('lists collection entries as array with pagination', async () => {
    client = await createModel(client, 'authors', 'collection', 'blog', {
      name: { type: 'string' },
    })

    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [
          { id: 'a001', locale: 'en', data: { name: 'Alice' } },
          { id: 'b002', locale: 'en', data: { name: 'Bob' } },
          { id: 'c003', locale: 'en', data: { name: 'Charlie' } },
        ],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_content_list',
      arguments: { model: 'authors', locale: 'en', limit: 2, offset: 0 },
    })

    const data = parseResult(result)
    expect(data['kind']).toBe('collection')
    expect(data['total']).toBe(3)
    const entries = data['data'] as Array<Record<string, unknown>>
    expect(entries).toHaveLength(2)
  })

  it('lists singleton as flat data', async () => {
    client = await createModel(client, 'hero', 'singleton', 'marketing', {
      title: { type: 'string' },
    })

    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'hero',
        entries: [{ locale: 'en', data: { title: 'Hello World' } }],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_content_list',
      arguments: { model: 'hero', locale: 'en' },
    })

    const data = parseResult(result)
    expect(data['kind']).toBe('singleton')
    expect((data['data'] as Record<string, unknown>)['title']).toBe('Hello World')
  })

  it('lists dictionary with total_keys', async () => {
    client = await createModel(client, 'error-messages', 'dictionary', 'system')

    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'error-messages',
        entries: [{ locale: 'en', data: { 'key1': 'val1', 'key2': 'val2' } }],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_content_list',
      arguments: { model: 'error-messages', locale: 'en' },
    })

    const data = parseResult(result)
    expect(data['kind']).toBe('dictionary')
    expect(data['total_keys']).toBe(2)
  })

  it('resolves relation fields in collection list', async () => {
    // Create target model
    client = await createModel(client, 'authors', 'collection', 'blog', {
      name: { type: 'string' },
    })

    // Save author
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [{ id: 'author-001', locale: 'en', data: { name: 'Alice' } }],
      },
    })

    client = await createTestClient(testDir)

    // Create referencing model
    client = await createModel(client, 'posts', 'collection', 'blog', {
      title: { type: 'string' },
      author: { type: 'relation', model: 'authors' },
    })

    // Save post with relation
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'posts',
        entries: [{ id: 'post-001', locale: 'en', data: { title: 'My Post', author: 'author-001' } }],
      },
    })

    client = await createTestClient(testDir)

    // List with resolve
    const result = await client.callTool({
      name: 'contentrain_content_list',
      arguments: { model: 'posts', locale: 'en', resolve: true },
    })

    const data = parseResult(result)
    const entries = data['data'] as Array<Record<string, unknown>>
    const post = entries[0]!
    const author = post['author'] as Record<string, unknown>
    expect(author['id']).toBe('author-001')
    expect(author['name']).toBe('Alice')
  })
})

describe('contentrain_content_save advisories', () => {
  it('returns advisory when dictionary value already exists under different key', async () => {
    client = await createModel(client, 'ui-strings', 'dictionary', 'system')

    // Save initial keys
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'ui-strings',
        entries: [{ locale: 'en', data: { 'dialog.cancel': 'Cancel' } }],
      },
    })

    client = await createTestClient(testDir)

    // Save duplicate value under new key
    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'ui-strings',
        entries: [{ locale: 'en', data: { 'form.cancel': 'Cancel' } }],
      },
    })

    const data = parseResult(result)
    expect(data['status']).toBe('committed')
    expect(data['advisories']).toBeDefined()
    const advisories = data['advisories'] as string[]
    expect(advisories.length).toBeGreaterThan(0)
    expect(advisories[0]).toContain('dialog.cancel')
    expect(data['advisory_note']).toBeDefined()
  })

  it('returns no advisory when dictionary values are unique', async () => {
    client = await createModel(client, 'ui-strings', 'dictionary', 'system')

    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'ui-strings',
        entries: [{ locale: 'en', data: { 'key1': 'Hello' } }],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'ui-strings',
        entries: [{ locale: 'en', data: { 'key2': 'World' } }],
      },
    })

    const data = parseResult(result)
    expect(data['status']).toBe('committed')
    expect(data['advisories']).toBeUndefined()
  })
})
