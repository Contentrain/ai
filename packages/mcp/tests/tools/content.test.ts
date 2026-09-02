import { describe, expect, it, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'

// Real git writes; the surrounding suites make these contend for the machine.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createGit } from '../../src/git/identity.js'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { readJson, readText } from '../../src/util/fs.js'
import { cloneTemplate, createClient as createTestClient, makeInitedTemplate, parseResult } from '../support/project.js'

// One inited project per file, cloned per test. Each `contentrain_init` is 33
// git subprocesses; running it 17 times to test content writes was paying for
// project setup, not for anything these tests assert.
let template: string
let testDir: string
let client: Client

/**
 * Title field for a test model: dictionaries use the reserved key sentinel,
 * everything else takes its first declared field — enough for a fixture, and
 * the validator rejects it loudly if a test ever declares something unshowable.
 */
const TITLE_TYPES = new Set(['string', 'text', 'slug', 'email', 'url', 'code', 'markdown', 'richtext'])

function testTitleField(kind: string, fields?: Record<string, unknown>): string {
  if (kind === 'dictionary') return 'key'
  const displayable = Object.entries(fields ?? {}).find(
    ([, def]) => TITLE_TYPES.has(String((def as { type?: unknown }).type)),
  )
  return displayable?.[0] ?? 'title'
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
      title_field: testTitleField(kind, fields),
      fields,
    },
  })
  return createTestClient(testDir)
}

beforeAll(async () => {
  template = await makeInitedTemplate({ locales: ['en', 'tr'] })
})

afterAll(async () => {
  await rm(template, { recursive: true, force: true })
})

beforeEach(async () => {
  testDir = await cloneTemplate(template)
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
    const branches = await createGit(testDir).branchLocal()
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

  it('blocks new writes when the unmerged branch limit is reached', async () => {
    client = await createModel(client, 'hero', 'singleton', 'marketing', {
      title: { type: 'string', required: true },
    })

    // Lower the configurable block limit so the test doesn't have to create 80
    // real branches (hundreds of git subprocesses that lock up the machine).
    const configPath = join(testDir, '.contentrain', 'config.json')
    const config = await readJson<Record<string, unknown>>(configPath)
    config!['branchBlockLimit'] = 3
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n')

    // Create 3 unmerged cr/* branches cheaply: one divergent commit object
    // (commit-tree touches neither the index nor the working tree), then point
    // each branch ref at it — no checkouts, no per-branch commits.
    const git = createGit(testDir)
    const head = (await git.raw(['rev-parse', 'HEAD'])).trim()
    const tree = (await git.raw(['rev-parse', 'HEAD^{tree}'])).trim()
    const divergent = (await git.raw(['commit-tree', tree, '-p', head, '-m', 'divergent'])).trim()
    for (let i = 1; i <= 3; i++) {
      await git.raw(['branch', `cr/test/block-${i}`, divergent])
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
    expect(data['action']).toBe('blocked')
    expect(data['error']).toContain('BLOCKED')
  }, 60000)

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

/**
 * #125 — `publish_at` on a document: it did not publish (by design — it gates
 * delivery of a *published* entry), but it also leaked into the frontmatter and
 * could never be removed, because documents merge frontmatter on save. The tool
 * now keeps it in meta, says what it did and did not do, and clears on `null`.
 */
describe('contentrain_content_save scheduling on a document', () => {
  const FIELDS = { title: { type: 'string', required: true }, slug: { type: 'slug', required: true } }
  const docPath = () => join(testDir, '.contentrain', 'content', 'blog', 'guide-sections', 'instagram-9', 'tr.md')
  const metaPath = () => join(testDir, '.contentrain', 'meta', 'guide-sections', 'instagram-9', 'tr.json')

  async function save(entry: Record<string, unknown>): Promise<Record<string, unknown>> {
    client = await createTestClient(testDir)
    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'guide-sections', entries: [{ slug: 'instagram-9', locale: 'tr', ...entry }] },
    })
    return parseResult(result)
  }

  it('records a past publish_at in meta only, leaves the draft a draft, and says so', async () => {
    client = await createModel(client, 'guide-sections', 'document', 'blog', FIELDS)

    const data = await save({
      data: { title: 'Instagram 9', slug: 'instagram-9', body: '# Instagram' },
      publish_at: '2026-08-01T00:00:00.000Z',
    })

    expect(data['status']).toBe('committed')
    expect(String(data['scheduling_note'])).toContain('status is unchanged')
    expect((data['next_steps'] as string[]).some(s => s.includes('contentrain_bulk update_status'))).toBe(true)

    const raw = await readText(docPath())
    expect(raw).not.toContain('publish_at')
    expect(raw).toContain('title: Instagram 9')
    const meta = await readJson<Record<string, unknown>>(metaPath())
    expect(meta!['publish_at']).toBe('2026-08-01T00:00:00.000Z')
    expect(meta!['status']).toBe('draft')
  })

  it('keeps the date when a later save omits it, and clears it on null', async () => {
    client = await createModel(client, 'guide-sections', 'document', 'blog', FIELDS)
    await save({ data: { title: 'Instagram 9', slug: 'instagram-9', body: '# Instagram' }, publish_at: '2026-08-01T00:00:00.000Z' })

    const untouched = await save({ data: { title: 'Instagram 9 (edited)' } })
    expect(untouched['scheduling_note']).toBeUndefined()
    expect((await readJson<Record<string, unknown>>(metaPath()))!['publish_at']).toBe('2026-08-01T00:00:00.000Z')

    const cleared = await save({ data: { title: 'Instagram 9 (edited)' }, publish_at: null })
    expect(cleared['status']).toBe('committed')
    expect(await readJson<Record<string, unknown>>(metaPath())).not.toHaveProperty('publish_at')
    // The body survived both edits — neither mentioned it.
    expect(await readText(docPath())).toContain('# Instagram')
  })

  it('still rejects an unparseable date and an expiry before the publish date', async () => {
    client = await createModel(client, 'guide-sections', 'document', 'blog', FIELDS)

    const bad = await save({ data: { title: 'x', slug: 'instagram-9', body: 'b' }, publish_at: 'next tuesday' })
    expect(bad['error']).toContain('Invalid publish_at date')

    const inverted = await save({
      data: { title: 'x', slug: 'instagram-9', body: 'b' },
      publish_at: '2026-09-01T00:00:00.000Z',
      expire_at: '2026-08-01T00:00:00.000Z',
    })
    expect(inverted['error']).toContain('must be after publish_at')
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
