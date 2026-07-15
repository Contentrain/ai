import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'
import { readJson } from '../../src/util/fs.js'

/**
 * The write gate. content_save used to run plan → commit → validate → report:
 * an invalid value landed in git, was auto-merged, and the caller learned about
 * it from a string in `next_steps` while `status` still said "committed".
 *
 * These assert on the repository, not on the response — a gate that only claims
 * to have blocked is the bug we are fixing.
 */

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

async function createModel(id: string, fields: Record<string, unknown>): Promise<void> {
  await client.callTool({
    name: 'contentrain_model_save',
    arguments: { id, name: id, kind: 'collection', domain: 'blog', i18n: true, fields },
  })
  client = await createTestClient(testDir)
}

function contentFile(model: string, locale: string): Promise<Record<string, unknown> | null> {
  return readJson(join(testDir, '.contentrain', 'content', 'blog', model, `${locale}.json`))
}

async function branches(): Promise<string[]> {
  return (await simpleGit(testDir).branchLocal()).all
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-gate-test-'))
  await initProject(testDir)
  client = await createTestClient(testDir)
  await client.callTool({ name: 'contentrain_init', arguments: { locales: ['en'] } })
  client = await createTestClient(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('contentrain_content_save write gate', () => {
  it('writes nothing when a value is invalid', async () => {
    await createModel('posts', { title: { type: 'string', required: true }, slug: { type: 'slug' } })
    const before = await branches()

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'posts',
        entries: [{ locale: 'en', data: { title: 'Hi', slug: 'Not A Slug!!' } }],
      },
    })

    const data = parseResult(result)
    expect(data['status']).not.toBe('committed')
    expect(data['error']).toContain('nothing was written')

    // The repository is the witness: no content, no new branch.
    const content = await contentFile('posts', 'en')
    expect(content ?? {}).toEqual({})
    expect(await branches()).toEqual(before)
  })

  it('names the offending field so the caller can fix it', async () => {
    await createModel('posts', { title: { type: 'string', required: true }, slug: { type: 'slug' } })

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'posts',
        entries: [{ locale: 'en', data: { title: 'Hi', slug: 'Not A Slug!!' } }],
      },
    })

    const issues = parseResult(result)['issues'] as Array<Record<string, unknown>>
    expect(issues.some(i => i['field'] === 'slug')).toBe(true)
  })

  it('commits a valid entry', async () => {
    await createModel('posts', { title: { type: 'string', required: true }, slug: { type: 'slug' } })

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'posts',
        entries: [{ locale: 'en', data: { title: 'Hi', slug: 'a-real-slug' } }],
      },
    })

    expect(parseResult(result)['status']).toBe('committed')
    expect(Object.keys(await contentFile('posts', 'en') ?? {})).toHaveLength(1)
  })

  it('lets a warning through and reports it', async () => {
    // Heuristics must not block — a legitimate value can sit outside the pattern.
    await createModel('people', { name: { type: 'string' }, contact: { type: 'email' } })

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'people',
        entries: [{ locale: 'en', data: { name: 'Ada', contact: 'not-an-email' } }],
      },
    })

    const data = parseResult(result)
    expect(data['status']).toBe('committed')
    expect((data['warnings'] as string[]).some(w => /email/.test(w))).toBe(true)
    expect(Object.keys(await contentFile('people', 'en') ?? {})).toHaveLength(1)
  })

  it('refuses to commit a secret', async () => {
    // Falls out of the gate rather than being a special case: detectSecrets is an
    // error, and errors no longer reach git. Pinned because it is the sharpest
    // consequence of moving validation ahead of the commit.
    await createModel('settings', { name: { type: 'string' }, token: { type: 'string' } })
    const before = await branches()

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'settings',
        entries: [{ locale: 'en', data: { name: 'API', token: 'sk_live_abc123secret' } }],
      },
    })

    expect(parseResult(result)['error']).toContain('nothing was written')
    expect(await contentFile('settings', 'en') ?? {}).toEqual({})
    expect(await branches()).toEqual(before)
  })

  it('does not block a valid save because another entry is already broken', async () => {
    // A pre-existing bad entry elsewhere in the model must not hold the caller
    // hostage — they may not even be able to fix it.
    await createModel('posts', { title: { type: 'string', required: true }, slug: { type: 'slug' } })

    const first = await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'posts', entries: [{ locale: 'en', data: { title: 'Good', slug: 'ok-one' } }] },
    })
    const goodId = (parseResult(first)['results'] as Array<Record<string, unknown>>)[0]!['id'] as string

    // Corrupt it behind MCP's back, the way a hand-edit or an older version would.
    const path = join(testDir, '.contentrain', 'content', 'blog', 'posts', 'en.json')
    const { writeJson } = await import('../../src/util/fs.js')
    const existing = await readJson<Record<string, unknown>>(path) ?? {}
    existing[goodId] = { title: 'Good', slug: 'BROKEN SLUG!!' }
    await writeJson(path, existing)
    const git = simpleGit(testDir)
    await git.add('.')
    await git.commit('corrupt entry')
    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'posts', entries: [{ locale: 'en', data: { title: 'New', slug: 'ok-two' } }] },
    })

    expect(parseResult(result)['status']).toBe('committed')
  })
})
