import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 30000 })
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'
import { pathExists, readJson } from '../../src/util/fs.js'
import type { ModelDefinition } from '@contentrain/types'

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

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-model-test-'))
  await initProject(testDir)
  client = await createTestClient(testDir)

  // Initialize project first
  await client.callTool({ name: 'contentrain_init', arguments: {} })
  client = await createTestClient(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('contentrain_model_save', () => {
  it('creates a new model', async () => {
    const result = await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'test-model',
        name: 'Test Model',
        kind: 'collection',
        domain: 'test',
        i18n: true,
        fields: {
          title: { type: 'string', required: true },
          slug: { type: 'slug', required: true, unique: true },
        },
      },
    })

    const data = parseResult(result)
    expect(data['action']).toBe('created')
    expect(data['model']).toBe('test-model')
    expect(data['context_updated']).toBe(true)

    const git = data['git'] as Record<string, unknown>
    expect(git['action']).toBe('auto-merged')

    // Verify model file on disk
    const modelDef = await readJson<ModelDefinition>(
      join(testDir, '.contentrain', 'models', 'test-model.json'),
    )
    expect(modelDef).not.toBeNull()
    expect(modelDef!.kind).toBe('collection')
    expect(modelDef!.fields!['title']!.type).toBe('string')
  })

  it('updates an existing model', async () => {
    // Create first
    await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'updatable',
        name: 'Original',
        kind: 'singleton',
        domain: 'test',
        i18n: false,
        fields: { title: { type: 'string' } },
      },
    })

    client = await createTestClient(testDir)

    // Update
    const result = await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'updatable',
        name: 'Updated',
        kind: 'singleton',
        domain: 'test',
        i18n: true,
        fields: { title: { type: 'string' }, subtitle: { type: 'text' } },
      },
    })

    const data = parseResult(result)
    expect(data['action']).toBe('updated')
  })

  it('validates field types', async () => {
    const result = await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'bad-model',
        name: 'Bad',
        kind: 'collection',
        domain: 'test',
        i18n: false,
        fields: { broken: { type: 'nonexistent-type' } },
      },
    })

    const data = parseResult(result)
    expect(data['error']).toBe('Validation failed')
  })

  it('validates relation requires model', async () => {
    const result = await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'rel-model',
        name: 'Rel',
        kind: 'collection',
        domain: 'test',
        i18n: false,
        fields: { author: { type: 'relation' } },
      },
    })

    const data = parseResult(result)
    expect(data['error']).toBe('Validation failed')
  })

  it('returns error when not initialized', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'cr-empty-'))
    const git = simpleGit(emptyDir)
    await git.init()
    await git.addConfig('user.name', 'Test')
    await git.addConfig('user.email', 'test@test.com')
    await writeFile(join(emptyDir, '.gitkeep'), '')
    await git.add('.')
    await git.commit('initial')

    const emptyClient = await createTestClient(emptyDir)
    const result = await emptyClient.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'fail',
        name: 'Fail',
        kind: 'collection',
        domain: 'test',
        i18n: false,
      },
    })

    const data = parseResult(result)
    expect(data['error']).toContain('not initialized')

    await rm(emptyDir, { recursive: true, force: true })
  })
})

describe('contentrain_model_delete', () => {
  it('deletes a model', async () => {
    // Create model first
    await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'deletable',
        name: 'Deletable',
        kind: 'singleton',
        domain: 'test',
        i18n: false,
        fields: { title: { type: 'string' } },
      },
    })

    client = await createTestClient(testDir)

    const result = await client.callTool({
      name: 'contentrain_model_delete',
      arguments: { model: 'deletable', confirm: true },
    })

    const data = parseResult(result)
    expect(data['deleted']).toBe(true)

    const git = data['git'] as Record<string, unknown>
    expect(git['action']).toBe('auto-merged')

    // Verify model file is gone
    expect(await pathExists(join(testDir, '.contentrain', 'models', 'deletable.json'))).toBe(false)
  })

  it('blocks deletion when referenced', async () => {
    // Create target model
    await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'authors',
        name: 'Authors',
        kind: 'collection',
        domain: 'blog',
        i18n: false,
        fields: { name: { type: 'string' } },
      },
    })

    client = await createTestClient(testDir)

    // Create referencing model
    await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'blog-post',
        name: 'Blog Post',
        kind: 'document',
        domain: 'blog',
        i18n: true,
        fields: {
          title: { type: 'string' },
          author: { type: 'relation', model: 'authors' },
        },
      },
    })

    client = await createTestClient(testDir)

    // Try to delete authors — should be blocked
    const result = await client.callTool({
      name: 'contentrain_model_delete',
      arguments: { model: 'authors', confirm: true },
    })

    const data = parseResult(result)
    expect(data['deleted']).toBe(false)
    expect(data['error']).toBe('REFERENCED_MODEL')

    const refs = data['referenced_by'] as Array<{ model: string; field: string }>
    expect(refs).toHaveLength(1)
    expect(refs[0]!.model).toBe('blog-post')
    expect(refs[0]!.field).toBe('author')
  })

  it('returns error for nonexistent model', async () => {
    const result = await client.callTool({
      name: 'contentrain_model_delete',
      arguments: { model: 'ghost', confirm: true },
    })

    const data = parseResult(result)
    expect(data['error']).toContain('not found')
  })
})
