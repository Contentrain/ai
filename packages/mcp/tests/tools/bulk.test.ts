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

// Status changes moved to contentrain_content_status; bulk no longer takes one.
describe('contentrain_bulk without update_status', () => {
  it('rejects the operation and its schema no longer offers it', async () => {
    const { tools } = await client.listTools()
    const bulk = tools.find(t => t.name === 'contentrain_bulk')!
    const operation = (bulk.inputSchema.properties as Record<string, { enum?: string[] }>)['operation']!
    expect(operation.enum).toEqual(['copy_locale', 'delete_entries'])
    expect(bulk.annotations?.destructiveHint).toBe(true)

    const result = await client.callTool({
      name: 'contentrain_bulk',
      arguments: { operation: 'update_status', model: 'guides', entry_ids: ['abc123def456'], status: 'published' },
    }) as { isError?: boolean }
    expect(result.isError).toBe(true)
  })
})
