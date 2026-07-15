import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { EntryMeta } from '@contentrain/types'
import { createServer } from '../../src/server.js'
import { readJson } from '../../src/util/fs.js'

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
  await Promise.all([c.connect(clientTransport), server.connect(serverTransport)])
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
  opts: { i18n?: boolean; fields?: Record<string, unknown> } = {},
): Promise<Client> {
  await c.callTool({
    name: 'contentrain_model_save',
    arguments: { id, name: id, kind, domain, i18n: opts.i18n ?? true, fields: opts.fields },
  })
  return createTestClient(testDir)
}

function collectionMeta(model: string, locale: string): Promise<Record<string, EntryMeta> | null> {
  return readJson<Record<string, EntryMeta>>(join(testDir, '.contentrain', 'meta', model, `${locale}.json`))
}

function recordMeta(model: string, locale: string): Promise<EntryMeta | null> {
  return readJson<EntryMeta>(join(testDir, '.contentrain', 'meta', model, `${locale}.json`))
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-bulk-tool-test-'))
  await initProject(testDir)
  client = await createTestClient(testDir)
  await client.callTool({ name: 'contentrain_init', arguments: { locales: ['en', 'tr'] } })
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
