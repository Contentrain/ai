import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'
import { pathExists, readJson } from '../../src/util/fs.js'

let testDir: string
let client: Client

async function initGitRepo(dir: string): Promise<void> {
  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  // Need at least one commit to create branches from
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

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-setup-test-'))
  await initGitRepo(testDir)
  client = await createTestClient(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('contentrain_init', () => {
  it('creates .contentrain structure', async () => {
    const result = await client.callTool({
      name: 'contentrain_init',
      arguments: { locales: ['en', 'tr'] },
    })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.config_created).toBe('.contentrain/config.json')
    expect(data.detected_locales).toEqual(['en', 'tr'])
    expect(data.gitignore_updated).toBe(true)
    expect(data.git.action).toBe('auto-merged')

    // Verify files exist on main
    expect(await pathExists(join(testDir, '.contentrain', 'config.json'))).toBe(true)
    expect(await pathExists(join(testDir, '.contentrain', 'vocabulary.json'))).toBe(true)
    expect(await pathExists(join(testDir, '.contentrain', 'context.json'))).toBe(true)
    expect(await pathExists(join(testDir, '.contentrain', 'models'))).toBe(true)
    expect(await pathExists(join(testDir, '.contentrain', 'content'))).toBe(true)
    expect(await pathExists(join(testDir, '.contentrain', 'meta'))).toBe(true)

    // Verify contentrain branch exists
    const branches = await simpleGit(testDir).branchLocal()
    expect(branches.all).toContain('contentrain')
  })

  it('detects stack from package.json', async () => {
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({ dependencies: { nuxt: '^3.0.0' } }),
    )
    const git = simpleGit(testDir)
    await git.add('.')
    await git.commit('add package.json')

    const result = await client.callTool({
      name: 'contentrain_init',
      arguments: {},
    })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.detected_stack).toBe('nuxt')
  })

  it('returns error if already initialized', async () => {
    // Init once
    await client.callTool({ name: 'contentrain_init', arguments: {} })

    // Re-create client to pick up changes
    client = await createTestClient(testDir)

    // Try again
    const result = await client.callTool({ name: 'contentrain_init', arguments: {} })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.error).toBe('Already initialized')
  })

  it('initialises a greenfield directory with no .git and no commits', async () => {
    // Tear down the default fixture's git repo + starting commit so we
    // can exercise the empty-repo path. MCP's contentrain_init must
    // seed an `--allow-empty` initial commit itself, because
    // `ensureContentBranch` needs a base ref to fork from.
    await rm(join(testDir, '.git'), { recursive: true, force: true })
    client = await createTestClient(testDir)

    const result = await client.callTool({ name: 'contentrain_init', arguments: { locales: ['en'] } })
    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.error).toBeUndefined()
    expect(data.status).toBe('committed')
    expect(await pathExists(join(testDir, '.contentrain/config.json'))).toBe(true)
    expect(await pathExists(join(testDir, '.git'))).toBe(true)

    // Verify at least two commits exist: the synthetic initial commit
    // + the contentrain init commit.
    const git = simpleGit(testDir)
    const log = await git.log()
    expect(log.total).toBeGreaterThanOrEqual(2)
  })
})

describe('contentrain_scaffold', () => {
  it('creates models from blog template', async () => {
    // Init first
    await client.callTool({ name: 'contentrain_init', arguments: {} })
    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_scaffold',
      arguments: { template: 'blog', with_sample_content: true },
    })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.models_created).toHaveLength(3)
    const modelIds = data.models_created.map((m: { id: string }) => m.id)
    expect(modelIds).toContain('blog-post')
    expect(modelIds).toContain('categories')
    expect(modelIds).toContain('authors')

    expect(data.content_created).toBeGreaterThan(0)
    expect(data.vocabulary_terms_added).toBeGreaterThan(0)
    expect(data.context_updated).toBe(true)
    expect(data.git.commit).toBeDefined()

    // Verify model files exist
    expect(await pathExists(join(testDir, '.contentrain', 'models', 'blog-post.json'))).toBe(true)
    expect(await pathExists(join(testDir, '.contentrain', 'models', 'categories.json'))).toBe(true)
    expect(await pathExists(join(testDir, '.contentrain', 'models', 'authors.json'))).toBe(true)
  })

  it('writes valid singleton and dictionary sample content for i18n template', async () => {
    await client.callTool({ name: 'contentrain_init', arguments: {} })
    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_scaffold',
      arguments: { template: 'i18n', with_sample_content: true },
    })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)
    expect(data.status).toBe('committed')

    const navigation = await readJson<Record<string, unknown>>(
      join(testDir, '.contentrain', 'content', 'ui', 'navigation', 'en.json'),
    )
    expect(navigation).toBeTruthy()
    expect(navigation!['brand']).toBe('My App')
    expect(Array.isArray(navigation!['items'])).toBe(true)

    const errorMessages = await readJson<Record<string, unknown>>(
      join(testDir, '.contentrain', 'content', 'system', 'error-messages', 'en.json'),
    )
    expect(errorMessages).toBeTruthy()
    expect(errorMessages!['required-field']).toBe('This field is required')
    expect(errorMessages!['invalid-email']).toBe('Please enter a valid email')
  })

  it('returns error for unknown template', async () => {
    await client.callTool({ name: 'contentrain_init', arguments: {} })
    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_scaffold',
      arguments: { template: 'nonexistent' },
    })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.error).toContain('Unknown template')
  })

  it('returns error when not initialized', async () => {
    const result = await client.callTool({
      name: 'contentrain_scaffold',
      arguments: { template: 'blog' },
    })

    const content = result.content as Array<{ type: string; text: string }>
    const data = JSON.parse(content[0]!.text)

    expect(data.error).toContain('not initialized')
  })
})
