import { describe, expect, it, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { EntryMeta } from '@contentrain/types'
import { createServer } from '../../src/server.js'
import { createGit } from '../../src/git/identity.js'
import { cloneTemplate, makeInitedTemplate } from '../support/project.js'
import { readJson } from '../../src/util/fs.js'

let template: string
let testDir: string
let client: Client


async function createTestClient(projectRoot: string): Promise<Client> {
  const server = createServer(projectRoot)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const c = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([c.connect(clientTransport), server.connect(serverTransport)])
  return c
}

function parseResult(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ text: string }> }).content
  return JSON.parse(content[0]!.text) as Record<string, unknown>
}

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
  opts: { i18n?: boolean; fields?: Record<string, unknown> } = {},
): Promise<Client> {
  await c.callTool({
    name: 'contentrain_model_save',
    arguments: { id, name: id, kind, domain, i18n: opts.i18n ?? true, title_field: testTitleField(kind, opts.fields), fields: opts.fields },
  })
  return createTestClient(testDir)
}

function collectionMeta(model: string, locale: string): Promise<Record<string, EntryMeta> | null> {
  return readJson<Record<string, EntryMeta>>(join(testDir, '.contentrain', 'meta', model, `${locale}.json`))
}

function recordMeta(model: string, locale: string): Promise<EntryMeta | null> {
  return readJson<EntryMeta>(join(testDir, '.contentrain', 'meta', model, `${locale}.json`))
}

// One inited project per file, cloned per test — `contentrain_init` is 33 git
// subprocesses, and none of these tests are about project setup.
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

describe('contentrain_bulk update_status', () => {
  const FIELDS = { title: { type: 'string', required: true } }

  /** Seed a collection with `count` entries in both locales, returning their IDs. */
  async function seedCollection(count: number): Promise<string[]> {
    client = await createModel(client, 'guides', 'collection', 'marketing', { fields: FIELDS })
    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'guides',
        entries: Array.from({ length: count }, (_, i) => ({
          locale: 'en',
          data: { title: `Guide ${i}` },
        })),
      },
    })
    const results = parseResult(result)['results'] as Array<Record<string, unknown>>
    return results.map(r => r['id'] as string)
  }

  // The regression this file exists for: looping writeMeta over entry IDs made
  // every call rewrite the same locale file from the same snapshot, so only the
  // last-settling write survived while the response still claimed success for all.
  // Both assertions ride one call: every test here pays a full init + model_save
  // + content_save in git, so they are merged rather than seeded twice.
  it('persists every entry_id and reports a count matching disk', async () => {
    const ids = await seedCollection(5)
    expect(ids).toHaveLength(5)

    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'update_status', model: 'guides', entry_ids: ids, status: 'published' },
    })

    const data = parseResult(result)
    expect(data['status']).toBe('committed')

    const meta = await collectionMeta('guides', 'en')
    for (const id of ids) {
      expect(meta![id]!.status, `entry ${id} should be published`).toBe('published')
    }

    // The count must come from what persisted, not from entry_ids.length.
    const persisted = Object.values(meta!).filter(m => m.status === 'published').length
    expect(data['updated']).toBe(persisted)
    expect(data['updated']).toBe(5)
  })

  it('scopes to a single locale when locale is given', async () => {
    const ids = await seedCollection(2)
    await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'copy_locale', model: 'guides', source_locale: 'en', target_locale: 'tr' },
    })

    await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'update_status', model: 'guides', entry_ids: ids, status: 'published', locale: 'en' },
    })

    const en = await collectionMeta('guides', 'en')
    const tr = await collectionMeta('guides', 'tr')
    expect(en![ids[0]!]!.status).toBe('published')
    // The other locale must be left exactly as it was.
    expect(tr![ids[0]!]!.status).toBe('draft')
  })

  it('updates a singleton status without entry_ids', async () => {
    client = await createModel(client, 'hero', 'singleton', 'marketing', { fields: FIELDS })
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'hero', entries: [{ locale: 'en', data: { title: 'Hi' } }] },
    })
    expect((await recordMeta('hero', 'en'))!.status).toBe('draft')

    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'update_status', model: 'hero', status: 'published' },
    })

    expect(parseResult(result)['status']).toBe('committed')
    expect((await recordMeta('hero', 'en'))!.status).toBe('published')
  })

  it('fails loudly when no entry_id matches instead of reporting success', async () => {
    await seedCollection(1)

    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'update_status', model: 'guides', entry_ids: ['ffffffffffff'], status: 'published' },
    })

    const data = parseResult(result)
    expect(data['status']).not.toBe('committed')
    expect(data['error']).toContain('Nothing was changed')
  })

  // Guards reject before any git work, so these need a model but no content.
  describe('argument guards', () => {
    it('rejects entry_ids for a singleton with a message that names the fix', async () => {
      client = await createModel(client, 'hero', 'singleton', 'marketing', { fields: FIELDS })

      const result = await client.callTool({
        name: 'contentrain_bulk',
        arguments: { operation: 'update_status', model: 'hero', entry_ids: ['abc123def456'], status: 'published' },
      })

      expect(parseResult(result)['error']).toContain('Omit entry_ids')
    })

    it('requires entry_ids for a collection, and status for both', async () => {
      client = await createModel(client, 'guides', 'collection', 'marketing', { fields: FIELDS })

      const noStatus = await client.callTool({
        name: 'contentrain_bulk',
        arguments: { operation: 'update_status', model: 'guides', entry_ids: ['abc123def456'] },
      })
      expect(parseResult(noStatus)['error']).toContain('requires status')

      const noIds = await client.callTool({
        name: 'contentrain_bulk',
        arguments: { operation: 'update_status', model: 'guides', status: 'published' },
      })
      expect(parseResult(noIds)['error']).toContain('requires entry_ids')
    })
  })
})

/**
 * #124 — documents keep one meta file per slug, so update_status refused them
 * outright, and there was no other MCP or CLI path to publish a document. The
 * report: three `tr` drafts vanished from a live guide page the moment a
 * publish gate went in, with hand-editing `.contentrain/meta/` the only way back.
 */
describe('contentrain_bulk update_status on document models', () => {
  const FIELDS = { title: { type: 'string', required: true }, slug: { type: 'slug', required: true } }
  const SLUGS = ['instagram-9', 'instagram-10', 'instagram-11']

  async function seedDocuments(slugs: string[]): Promise<void> {
    client = await createModel(client, 'guide-sections', 'document', 'marketing', { fields: FIELDS })
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'guide-sections',
        entries: slugs.flatMap(slug => [
          { slug, locale: 'en', data: { title: slug, slug, body: `# ${slug}` } },
          { slug, locale: 'tr', data: { title: slug, slug, body: `# ${slug}` } },
        ]),
      },
    })
  }

  function documentMeta(slug: string, locale: string): Promise<EntryMeta | null> {
    return readJson<EntryMeta>(join(testDir, '.contentrain', 'meta', 'guide-sections', slug, `${locale}.json`))
  }

  it('publishes the named slugs in one locale and leaves the other locale alone', async () => {
    await seedDocuments(SLUGS)

    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'update_status', model: 'guide-sections', slugs: SLUGS, locale: 'tr', status: 'published' },
    })

    const data = parseResult(result)
    expect(data['status']).toBe('committed')
    expect(data['updated']).toBe(3)
    expect(data['updated_by_locale']).toEqual({ tr: SLUGS })
    expect(data['not_found']).toBeUndefined()
    for (const slug of SLUGS) {
      expect((await documentMeta(slug, 'tr'))!.status, `${slug} tr`).toBe('published')
      expect((await documentMeta(slug, 'en'))!.status, `${slug} en`).toBe('draft')
    }
  })

  it('reports slugs without meta instead of counting them as updated', async () => {
    await seedDocuments(['instagram-9'])

    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'update_status', model: 'guide-sections', slugs: ['instagram-9', 'missing-slug'], status: 'published' },
    })

    const data = parseResult(result)
    expect(data['status']).toBe('committed')
    // Both locales of the one real slug — the count comes from disk, not input.
    expect(data['updated']).toBe(2)
    expect(data['not_found']).toEqual(['missing-slug'])
  })

  describe('argument guards', () => {
    it('rejects entry_ids for a document and points at slugs', async () => {
      client = await createModel(client, 'guide-sections', 'document', 'marketing', { fields: FIELDS })

      const result = await client.callTool({
        name: 'contentrain_bulk',
        arguments: { operation: 'update_status', model: 'guide-sections', entry_ids: ['instagram-9'], status: 'published' },
      })

      expect(parseResult(result)['error']).toContain('Pass slugs instead of entry_ids')
    })

    it('requires slugs for a document', async () => {
      client = await createModel(client, 'guide-sections', 'document', 'marketing', { fields: FIELDS })

      const result = await client.callTool({
        name: 'contentrain_bulk',
        arguments: { operation: 'update_status', model: 'guide-sections', status: 'published' },
      })

      expect(parseResult(result)['error']).toContain('requires slugs')
    })

    it('rejects slugs for a collection', async () => {
      client = await createModel(client, 'guides', 'collection', 'marketing', { fields: { title: { type: 'string', required: true } } })

      const result = await client.callTool({
        name: 'contentrain_bulk',
        arguments: { operation: 'update_status', model: 'guides', slugs: ['a-slug'], status: 'published' },
      })

      expect(parseResult(result)['error']).toContain('slugs only apply to document models')
    })
  })
})

describe('contentrain_bulk copy_locale', () => {
  // Twin of the update_status race: the meta for every copied entry went through
  // its own concurrent read-modify-write of one shared file.
  it('writes meta for every copied entry, not just one', async () => {
    client = await createModel(client, 'guides', 'collection', 'marketing', {
      fields: { title: { type: 'string', required: true } },
    })
    const saved = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'guides',
        entries: Array.from({ length: 4 }, (_, i) => ({ locale: 'en', data: { title: `G${i}` } })),
      },
    })
    const ids = (parseResult(saved)['results'] as Array<Record<string, unknown>>).map(r => r['id'] as string)

    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'copy_locale', model: 'guides', source_locale: 'en', target_locale: 'tr' },
    })

    const data = parseResult(result)
    expect(data['status']).toBe('committed')
    expect(data['copied']).toBe(4)

    const tr = await readJson<Record<string, EntryMeta>>(
      join(testDir, '.contentrain', 'meta', 'guides', 'tr.json'),
    )
    expect(Object.keys(tr!)).toHaveLength(4)
    for (const id of ids) {
      expect(tr![id]!.status, `copied entry ${id} should have meta`).toBe('draft')
    }
  })
})

/**
 * A dry run must be free: the operation runs in a throwaway worktree so the
 * report is exactly what would happen, and then nothing survives it — no commit,
 * no content on disk, and no `cr/*` branch left behind for the next caller to
 * trip over.
 */
describe('contentrain_bulk dry_run', () => {
  const FIELDS = { title: { type: 'string', required: true } }

  async function seed(count: number): Promise<string[]> {
    client = await createModel(client, 'guides', 'collection', 'marketing', { fields: FIELDS })
    const saved = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'guides',
        entries: Array.from({ length: count }, (_, i) => ({ locale: 'en', data: { title: `G${i}` } })),
      },
    })
    return (parseResult(saved)['results'] as Array<Record<string, unknown>>).map(r => r['id'] as string)
  }

  const branches = async (): Promise<string[]> =>
    (await createGit(testDir).branchLocal()).all.filter(b => b.startsWith('cr/'))

  it('previews update_status without touching meta or leaving a branch', async () => {
    const ids = await seed(3)
    const before = await collectionMeta('guides', 'en')

    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'update_status', model: 'guides', entry_ids: ids, status: 'published', dry_run: true },
    })

    const data = parseResult(result)
    expect(data['status']).toBe('preview')
    expect(data['dry_run']).toBe(true)
    expect(data['would_update']).toBe(3)
    expect((data['would_update_by_locale'] as Record<string, string[]>)['en']).toHaveLength(3)
    expect(data['git']).toBeUndefined()

    expect(await collectionMeta('guides', 'en')).toEqual(before)
    expect(await branches()).toEqual([])
  })

  it('reports the ids it could not find, same as the real run', async () => {
    const ids = await seed(2)
    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: {
        operation: 'update_status',
        model: 'guides',
        entry_ids: [...ids, 'deadbeefdeadbeef'],
        status: 'published',
        dry_run: true,
      },
    })
    const data = parseResult(result)
    expect(data['would_update']).toBe(2)
    expect(data['not_found']).toEqual(['deadbeefdeadbeef'])
  })

  it('says how many records copy_locale would REPLACE, not just copy', async () => {
    // The whole risk of copy_locale is that it overwrites the target locale;
    // a preview that only counted the source would hide it.
    await seed(4)
    await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'copy_locale', model: 'guides', source_locale: 'en', target_locale: 'tr' },
    })

    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'copy_locale', model: 'guides', source_locale: 'en', target_locale: 'tr', dry_run: true },
    })
    const data = parseResult(result)
    expect(data['status']).toBe('preview')
    expect(data['would_copy']).toBe(4)
    expect(data['would_replace']).toBe(4)
    expect((data['next_steps'] as string[])[0]).toContain('REPLACED')
  })

  it('does not write the target locale while previewing a copy', async () => {
    await seed(2)
    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'copy_locale', model: 'guides', source_locale: 'en', target_locale: 'tr', dry_run: true },
    })
    expect(parseResult(result)['would_replace']).toBe(0)
    expect(await collectionMeta('guides', 'tr')).toBeNull()
    expect(await branches()).toEqual([])
  })

  it('previews a delete without confirm, and deletes nothing', async () => {
    const ids = await seed(3)
    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'delete_entries', model: 'guides', entry_ids: ids.slice(0, 2), dry_run: true },
    })

    const data = parseResult(result)
    expect(data['status']).toBe('preview')
    expect(data['would_delete']).toBe(2)
    expect((data['files_to_remove'] as string[]).length).toBeGreaterThan(0)

    const meta = await collectionMeta('guides', 'en')
    expect(Object.keys(meta!)).toHaveLength(3)
    expect(await branches()).toEqual([])
  })

  it('still refuses a real delete without confirm, and points at the preview', async () => {
    const ids = await seed(1)
    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'delete_entries', model: 'guides', entry_ids: ids },
    })
    const data = parseResult(result)
    expect(data['error']).toContain('confirm:true')
    expect(data['hint']).toContain('dry_run:true')
  })
})

