import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'
import { readJson, writeJson } from '../../src/util/fs.js'

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
  testDir = await mkdtemp(join(tmpdir(), 'cr-workflow-test-'))
  await initProject(testDir)
  client = await createTestClient(testDir)

  // Initialize project with en + tr locales
  await client.callTool({ name: 'contentrain_init', arguments: { locales: ['en', 'tr'] } })
  client = await createTestClient(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('contentrain_validate', () => {
  it('returns valid for correct project', async () => {
    // Create a model with content in all locales
    client = await createModel(client, 'hero', 'singleton', 'marketing', {
      title: { type: 'string', required: true },
    })

    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'hero',
        entries: [
          { locale: 'en', data: { title: 'Hello' } },
          { locale: 'tr', data: { title: 'Merhaba' } },
        ],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_validate',
      arguments: {},
    })

    const data = parseResult(result)
    expect(data['valid']).toBe(true)
    const summary = data['summary'] as Record<string, unknown>
    expect(summary['errors']).toBe(0)
    expect(summary['models_checked']).toBeGreaterThan(0)

    // Verify contentrain branch exists after workflow operations
    const branches = await simpleGit(testDir).branchLocal()
    expect(branches.all).toContain('contentrain')
  })

  it('detects required field missing', async () => {
    client = await createModel(client, 'authors', 'collection', 'blog', {
      name: { type: 'string', required: true },
      bio: { type: 'text' },
    })

    // Save content with missing required field
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [{ id: 'author-001', locale: 'en', data: { bio: 'A developer' } }],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_validate',
      arguments: { model: 'authors' },
    })

    const data = parseResult(result)
    expect(data['valid']).toBe(false)
    const issues = data['issues'] as Array<Record<string, unknown>>
    const requiredIssue = issues.find(i =>
      i['field'] === 'name' && (i['message'] as string).includes('Required'),
    )
    expect(requiredIssue).toBeDefined()
    expect(requiredIssue!['severity']).toBe('error')
    expect(requiredIssue!['entry']).toBe('author-001')
  })

  it('detects broken relation', async () => {
    // Create target model
    client = await createModel(client, 'categories', 'collection', 'blog', {
      name: { type: 'string' },
    })

    // Create model with relation
    client = await createModel(client, 'posts', 'collection', 'blog', {
      title: { type: 'string' },
      category: { type: 'relation', model: 'categories' },
    })

    // Save post with nonexistent category reference
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'posts',
        entries: [{ id: 'post-001', locale: 'en', data: { title: 'My Post', category: 'nonexistent-cat' } }],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_validate',
      arguments: { model: 'posts' },
    })

    const data = parseResult(result)
    expect(data['valid']).toBe(false)
    const issues = data['issues'] as Array<Record<string, unknown>>
    const brokenRef = issues.find(i =>
      (i['message'] as string).includes('Broken relation'),
    )
    expect(brokenRef).toBeDefined()
    expect(brokenRef!['severity']).toBe('error')
    expect(brokenRef!['field']).toBe('category')
  })

  it('detects missing locale file (i18n parity)', async () => {
    client = await createModel(client, 'hero', 'singleton', 'marketing', {
      title: { type: 'string' },
    })

    // Save only en, not tr
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'hero',
        entries: [{ locale: 'en', data: { title: 'Hello' } }],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_validate',
      arguments: { model: 'hero' },
    })

    const data = parseResult(result)
    const issues = data['issues'] as Array<Record<string, unknown>>
    const missingLocale = issues.find(i =>
      (i['message'] as string).includes('Locale file missing') && i['locale'] === 'tr',
    )
    expect(missingLocale).toBeDefined()
    expect(missingLocale!['severity']).toBe('error')
  })

  it('detects secret in content', async () => {
    client = await createModel(client, 'settings', 'singleton', 'system', {
      api_endpoint: { type: 'string' },
      token: { type: 'string' },
    })

    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'settings',
        entries: [
          { locale: 'en', data: { api_endpoint: 'https://api.example.com', token: 'sk_live_abc123secret' } },
          { locale: 'tr', data: { api_endpoint: 'https://api.example.com', token: 'sk_live_abc123secret' } },
        ],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_validate',
      arguments: { model: 'settings' },
    })

    const data = parseResult(result)
    expect(data['valid']).toBe(false)
    const issues = data['issues'] as Array<Record<string, unknown>>
    const secretIssue = issues.find(i =>
      (i['message'] as string).includes('secret'),
    )
    expect(secretIssue).toBeDefined()
    expect(secretIssue!['severity']).toBe('error')
  })

  it('detects pattern violations from schema constraints', async () => {
    client = await createModel(client, 'authors', 'collection', 'blog', {
      email: { type: 'string', required: true, pattern: '^[^@]+@example\\\\.com$' },
    })

    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [
          { id: 'author-001', locale: 'en', data: { email: 'alice@outside.com' } },
          { id: 'author-001', locale: 'tr', data: { email: 'alice@outside.com' } },
        ],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_validate',
      arguments: { model: 'authors' },
    })

    const data = parseResult(result)
    expect(data['valid']).toBe(false)
    const issues = data['issues'] as Array<Record<string, unknown>>
    const patternIssue = issues.find(i =>
      (i['message'] as string).includes('pattern'),
    )
    expect(patternIssue).toBeDefined()
    expect(patternIssue!['severity']).toBe('error')
    expect(patternIssue!['field']).toBe('email')
  })

  it('auto-fix orphan meta', async () => {
    client = await createModel(client, 'authors', 'collection', 'blog', {
      name: { type: 'string' },
    })

    // Save content
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [{ id: 'keep-me', locale: 'en', data: { name: 'Alice' } }],
      },
    })

    client = await createTestClient(testDir)

    // Manually inject orphan meta entry
    const metaPath = join(testDir, '.contentrain', 'meta', 'authors', 'en.json')
    const metaData = await readJson<Record<string, unknown>>(metaPath) ?? {}
    metaData['orphan-entry'] = { status: 'draft', source: 'agent', updated_by: 'test' }
    await writeJson(metaPath, metaData)

    // Commit the orphan meta so git is clean
    const git = simpleGit(testDir)
    await git.add('.')
    await git.commit('add orphan meta')

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_validate',
      arguments: { model: 'authors', fix: true },
    })

    const data = parseResult(result)
    expect(data['fixed']).toBeGreaterThan(0)

    // Verify orphan removed
    const updatedMeta = await readJson<Record<string, unknown>>(metaPath)
    expect(updatedMeta!['orphan-entry']).toBeUndefined()
    expect(updatedMeta!['keep-me']).toBeDefined()
  })

  it('auto-fix orphan content by recreating missing meta entries', async () => {
    client = await createModel(client, 'authors', 'collection', 'blog', {
      name: { type: 'string' },
    })

    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [
          { id: 'keep-me', locale: 'en', data: { name: 'Alice' } },
          { id: 'keep-me', locale: 'tr', data: { name: 'Aylin' } },
        ],
      },
    })

    client = await createTestClient(testDir)

    const metaPath = join(testDir, '.contentrain', 'meta', 'authors', 'en.json')
    const metaData = await readJson<Record<string, Record<string, unknown>>>(metaPath) ?? {}
    delete metaData['keep-me']
    await writeJson(metaPath, metaData)

    const git = simpleGit(testDir)
    await git.add('.')
    await git.commit('remove author meta')

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_validate',
      arguments: { model: 'authors', fix: true },
    })

    const data = parseResult(result)
    expect(data['fixed']).toBeGreaterThan(0)

    const updatedMeta = await readJson<Record<string, Record<string, unknown>>>(metaPath)
    expect(updatedMeta!['keep-me']).toBeDefined()
    expect(updatedMeta!['keep-me']!['status']).toBe('draft')
    expect(updatedMeta!['keep-me']!['source']).toBe('import')
  })

  it('detects duplicate dictionary values', async () => {
    client = await createModel(client, 'ui-labels', 'dictionary', 'system')

    // Save dictionary with duplicate values
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'ui-labels',
        entries: [
          { locale: 'en', data: { 'dialog.cancel': 'Cancel', 'form.cancel': 'Cancel', 'nav.home': 'Home' } },
          { locale: 'tr', data: { 'dialog.cancel': 'İptal', 'form.cancel': 'İptal', 'nav.home': 'Ana Sayfa' } },
        ],
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_validate',
      arguments: { model: 'ui-labels' },
    })

    const data = parseResult(result)
    const issues = data['issues'] as Array<Record<string, unknown>>
    const dupeIssue = issues.find(i =>
      (i['message'] as string).includes('Duplicate value') && (i['message'] as string).includes('Cancel'),
    )
    expect(dupeIssue).toBeDefined()
    expect(dupeIssue!['severity']).toBe('warning')
    expect(dupeIssue!['model']).toBe('ui-labels')
  })

  it('auto-fix canonical sort', async () => {
    client = await createModel(client, 'authors', 'collection', 'blog', {
      name: { type: 'string' },
    })

    // Save content entries
    await client.callTool({
      name: 'contentrain_content_save',
      arguments: {
        model: 'authors',
        entries: [
          { id: 'aaa', locale: 'en', data: { name: 'Alice' } },
          { id: 'bbb', locale: 'en', data: { name: 'Bob' } },
        ],
      },
    })

    client = await createTestClient(testDir)

    // Manually mess up the order
    const contentPath = join(testDir, '.contentrain', 'content', 'blog', 'authors', 'en.json')
    const content = await readJson<Record<string, Record<string, unknown>>>(contentPath)
    // Reverse the order
    const reversed: Record<string, Record<string, unknown>> = {}
    const keys = Object.keys(content!).toReversed()
    for (const key of keys) {
      reversed[key] = content![key]!
    }
    // Write directly to bypass canonical sort
    const { writeFile: writeFileRaw } = await import('node:fs/promises')
    await writeFileRaw(contentPath, JSON.stringify(reversed, null, 2) + '\n', 'utf-8')

    // Commit so git is clean
    const git = simpleGit(testDir)
    await git.add('.')
    await git.commit('mess up order')

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_validate',
      arguments: { model: 'authors', fix: true },
    })

    const data = parseResult(result)
    expect(data['fixed']).toBeGreaterThan(0)

    // Verify keys are sorted
    const fixed = await readJson<Record<string, unknown>>(contentPath)
    const fixedKeys = Object.keys(fixed!)
    expect(fixedKeys).toEqual([...fixedKeys].toSorted())
  })
})

describe('contentrain_submit', () => {
  it('returns error if no remote', async () => {
    const result = await client.callTool({
      name: 'contentrain_submit',
      arguments: {},
    })

    const data = parseResult(result)
    expect(data['error']).toContain('No remote')
  })

  it('returns error if no branches to push', async () => {
    // Use a fresh dir without init (so no contentrain/* branches exist)
    const freshDir = await mkdtemp(join(tmpdir(), 'cr-submit-nobranch-'))
    const freshGit = simpleGit(freshDir)
    await freshGit.init()
    await freshGit.addConfig('user.name', 'Test')
    await freshGit.addConfig('user.email', 'test@test.com')
    await writeFile(join(freshDir, '.gitkeep'), '')
    await freshGit.add('.')
    await freshGit.commit('initial')
    await freshGit.addRemote('origin', 'https://github.com/test/test.git')

    // Create config so init check passes
    const { ensureDir } = await import('../../src/util/fs.js')
    await ensureDir(join(freshDir, '.contentrain'))
    await writeJson(join(freshDir, '.contentrain', 'config.json'), { version: 1, stack: 'other', workflow: 'auto-merge', locales: { default: 'en', supported: ['en'] }, domains: [] })
    await freshGit.add('.')
    await freshGit.commit('add config')

    const freshClient = await createTestClient(freshDir)

    const result = await freshClient.callTool({
      name: 'contentrain_submit',
      arguments: {},
    })

    const data = parseResult(result)
    expect(data['error']).toContain('No unmerged cr/')

    await rm(freshDir, { recursive: true, force: true })
  })
})
