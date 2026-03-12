import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 })
import { join } from 'node:path'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'

let testDir: string
let client: Client

async function initGitRepo(dir: string): Promise<void> {
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

async function createSourceFiles(dir: string): Promise<void> {
  await mkdir(join(dir, 'src', 'pages'), { recursive: true })
  await mkdir(join(dir, 'src', 'components'), { recursive: true })

  await writeFile(join(dir, 'src', 'pages', 'home.tsx'), `import React from 'react'
import { Hero } from '../components/Hero'

export default function Home() {
  return (
    <div>
      <Hero title="Welcome to our platform" />
      <p>Get started with our amazing product</p>
      <button>Sign Up</button>
    </div>
  )
}
`)

  await writeFile(join(dir, 'src', 'components', 'Hero.tsx'), `import React from 'react'

export function Hero({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>Build better software with us</p>
    </section>
  )
}
`)
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-apply-test-'))
  await initGitRepo(testDir)
  await createSourceFiles(testDir)

  const git = simpleGit(testDir)
  await git.add('.')
  await git.commit('add source files')

  client = await createTestClient(testDir)
  await client.callTool({ name: 'contentrain_init', arguments: {} })

  // Init writes context.json to working directory after merge — commit it
  await git.add('.')
  await git.commit('post-init context', { '--allow-empty': null })

  client = await createTestClient(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

// ─── Extract Mode ───

describe('contentrain_apply mode:extract', () => {
  it('returns preview in dry_run mode', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'extract',
        dry_run: true,
        extractions: [{
          model: 'ui-texts',
          kind: 'dictionary',
          domain: 'app',
          entries: [
            { locale: 'en', data: { welcome_title: 'Welcome to our platform' } },
          ],
        }],
      },
    })

    const data = parseResult(result)
    expect(data['mode']).toBe('extract')
    expect(data['dry_run']).toBe(true)

    const preview = data['preview'] as Record<string, unknown>
    expect(preview['models_to_create']).toContain('ui-texts')
    expect(preview['total_entries']).toBe(1)
    expect((preview['content_files'] as string[]).length).toBeGreaterThan(0)

    expect(data['next_steps']).toBeDefined()
  })

  it('defaults to dry_run when not specified', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'extract',
        extractions: [{
          model: 'ui-texts',
          kind: 'dictionary',
          domain: 'app',
          entries: [{ data: { key: 'value' } }],
        }],
      },
    })

    const data = parseResult(result)
    expect(data['dry_run']).toBe(true)
  })

  it('creates models and content when dry_run:false', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'extract',
        dry_run: false,
        extractions: [{
          model: 'ui-texts',
          kind: 'dictionary',
          domain: 'app',
          fields: {
            welcome_title: { type: 'string' },
            cta_button: { type: 'string' },
          },
          entries: [
            {
              locale: 'en',
              data: { welcome_title: 'Welcome to our platform', cta_button: 'Sign Up' },
              source: { file: 'src/pages/home.tsx', line: 7, value: 'Welcome to our platform' },
            },
          ],
        }],
      },
    })

    const data = parseResult(result)
    expect(data['dry_run']).toBe(false)

    const results = data['results'] as Record<string, unknown>
    expect(results['models_created']).toContain('ui-texts')
    expect(results['entries_written']).toBe(1)

    // Source map should be populated
    const sourceMap = results['source_map'] as Array<Record<string, unknown>>
    expect(sourceMap.length).toBe(1)
    expect(sourceMap[0]!['file']).toBe('src/pages/home.tsx')
    expect(sourceMap[0]!['value']).toBe('Welcome to our platform')

    // Git transaction should have happened
    const git = data['git'] as Record<string, unknown>
    expect(git['branch']).toContain('contentrain/normalize/extract')

    expect(data['context_updated']).toBe(true)
  })

  it('merges fields into existing model', async () => {
    // First create a model
    await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'extract',
        dry_run: false,
        extractions: [{
          model: 'ui-texts',
          kind: 'dictionary',
          domain: 'app',
          fields: { welcome_title: { type: 'string' } },
          entries: [{ locale: 'en', data: { welcome_title: 'Welcome' } }],
        }],
      },
    })

    // Commit any post-merge context changes
    const git = simpleGit(testDir)
    await git.add('.')
    await git.commit('post-extract context', { '--allow-empty': null })

    // Re-create client to pick up new state
    client = await createTestClient(testDir)

    // Now extract with a new field
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'extract',
        dry_run: true,
        extractions: [{
          model: 'ui-texts',
          kind: 'dictionary',
          domain: 'app',
          fields: { cta_button: { type: 'string' } },
          entries: [{ locale: 'en', data: { cta_button: 'Sign Up' } }],
        }],
      },
    })

    const data = parseResult(result)
    const preview = data['preview'] as Record<string, unknown>
    // Model already exists, should be in update list
    expect(preview['models_to_update']).toContain('ui-texts')
  })

  it('handles multiple extractions in one call', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'extract',
        dry_run: true,
        extractions: [
          {
            model: 'ui-texts',
            kind: 'dictionary',
            domain: 'app',
            entries: [
              { locale: 'en', data: { welcome: 'Welcome' } },
              { locale: 'tr', data: { welcome: 'Hoş Geldiniz' } },
            ],
          },
          {
            model: 'hero-section',
            kind: 'singleton',
            domain: 'marketing',
            entries: [
              { locale: 'en', data: { title: 'Build better software', subtitle: 'Get started today' } },
            ],
          },
        ],
      },
    })

    const data = parseResult(result)
    const preview = data['preview'] as Record<string, unknown>
    expect(preview['total_entries']).toBe(3)
    expect((preview['models_to_create'] as string[]).length).toBe(2)
  })

  it('returns error without extractions', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'extract',
      },
    })

    const data = parseResult(result)
    expect(data['error']).toContain('extractions')
  })
})

// ─── Reuse Mode ───

describe('contentrain_apply mode:reuse', () => {
  beforeEach(async () => {
    // First create a model so scope check passes
    await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'extract',
        dry_run: false,
        extractions: [{
          model: 'ui-texts',
          kind: 'dictionary',
          domain: 'app',
          fields: { welcome_title: { type: 'string' } },
          entries: [{ locale: 'en', data: { welcome_title: 'Welcome to our platform' } }],
        }],
      },
    })

    // Extract writes context.json after merge — commit so working dir is clean
    const git = simpleGit(testDir)
    await git.add('.')
    await git.commit('post-extract context', { '--allow-empty': null })

    client = await createTestClient(testDir)
  })

  it('returns preview in dry_run mode', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: true,
        scope: { model: 'ui-texts' },
        patches: [
          {
            file: 'src/pages/home.tsx',
            line: 7,
            old_value: 'Welcome to our platform',
            new_expression: "dictionary('ui-texts').locale('en').get('welcome_title')",
            import_statement: "import { dictionary } from '#contentrain'",
          },
        ],
      },
    })

    const data = parseResult(result)
    expect(data['mode']).toBe('reuse')
    expect(data['dry_run']).toBe(true)

    const preview = data['preview'] as Record<string, unknown>
    expect(preview['files_to_modify']).toContain('src/pages/home.tsx')
    expect(preview['patches_count']).toBe(1)
    expect(preview['imports_to_add']).toBe(1)
  })

  it('patches source files when dry_run:false', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: false,
        scope: { model: 'ui-texts' },
        patches: [
          {
            file: 'src/pages/home.tsx',
            line: 7,
            old_value: 'Welcome to our platform',
            new_expression: "dictionary('ui-texts').locale('en').get('welcome_title')",
            import_statement: "import { dictionary } from '#contentrain'",
          },
        ],
      },
    })

    const data = parseResult(result)
    expect(data['dry_run']).toBe(false)

    const results = data['results'] as Record<string, unknown>
    expect(results['patches_applied']).toBe(1)
    expect((results['files_modified'] as string[]).length).toBe(1)
    expect(results['imports_added']).toBe(1)

    const git = data['git'] as Record<string, unknown>
    expect(git['branch']).toContain('contentrain/normalize/reuse')
  })

  it('patches multiple files', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: false,
        scope: { model: 'ui-texts' },
        patches: [
          {
            file: 'src/pages/home.tsx',
            line: 7,
            old_value: 'Welcome to our platform',
            new_expression: "dictionary('ui-texts').locale('en').get('welcome_title')",
          },
          {
            file: 'src/components/Hero.tsx',
            line: 7,
            old_value: 'Build better software with us',
            new_expression: "dictionary('ui-texts').locale('en').get('hero_subtitle')",
          },
        ],
      },
    })

    const data = parseResult(result)
    const results = data['results'] as Record<string, unknown>
    expect(results['patches_applied']).toBe(2)
    expect((results['files_modified'] as string[]).length).toBe(2)
  })

  it('skips patches when old_value not found', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: false,
        scope: { model: 'ui-texts' },
        patches: [
          {
            file: 'src/pages/home.tsx',
            line: 7,
            old_value: 'This string does not exist in the file',
            new_expression: 'replacement',
          },
        ],
      },
    })

    const data = parseResult(result)
    const results = data['results'] as Record<string, unknown>
    expect(results['patches_applied']).toBe(0)
    expect((results['patches_skipped'] as Array<unknown>).length).toBe(1)
  })

  it('skips patches for non-existent files', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: false,
        scope: { model: 'ui-texts' },
        patches: [
          {
            file: 'src/pages/nonexistent.tsx',
            line: 1,
            old_value: 'test',
            new_expression: 'replacement',
          },
        ],
      },
    })

    const data = parseResult(result)
    const results = data['results'] as Record<string, unknown>
    expect(results['patches_applied']).toBe(0)
    expect((results['patches_skipped'] as Array<Record<string, unknown>>)[0]!['reason']).toBe('file not found')
  })

  it('requires scope', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        patches: [
          { file: 'src/pages/home.tsx', line: 1, old_value: 'test', new_expression: 'x' },
        ],
      },
    })

    const data = parseResult(result)
    expect(data['error']).toContain('scope')
  })

  it('rejects unknown model in scope', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        scope: { model: 'nonexistent-model' },
        patches: [
          { file: 'src/pages/home.tsx', line: 1, old_value: 'test', new_expression: 'x' },
        ],
      },
    })

    const data = parseResult(result)
    expect(data['error']).toContain('not found')
  })

  it('uses proximity line matching (±10 lines)', async () => {
    // Provide a slightly wrong line number — should still find the string
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: false,
        scope: { model: 'ui-texts' },
        patches: [
          {
            file: 'src/pages/home.tsx',
            line: 5, // actual line is 7, but within ±10 range
            old_value: 'Welcome to our platform',
            new_expression: "dictionary('ui-texts').locale('en').get('welcome_title')",
          },
        ],
      },
    })

    const data = parseResult(result)
    const results = data['results'] as Record<string, unknown>
    expect(results['patches_applied']).toBe(1)
  })
})

// ─── Error Handling ───

describe('contentrain_apply errors', () => {
  it('returns error if not initialized', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'cr-apply-empty-'))
    const git = simpleGit(emptyDir)
    await git.init()
    await git.addConfig('user.name', 'Test')
    await git.addConfig('user.email', 'test@test.com')
    await writeFile(join(emptyDir, '.gitkeep'), '')
    await git.add('.')
    await git.commit('initial')

    const emptyClient = await createTestClient(emptyDir)
    const result = await emptyClient.callTool({
      name: 'contentrain_apply',
      arguments: { mode: 'extract', extractions: [{ model: 'test', kind: 'dictionary', domain: 'app', entries: [{ data: { k: 'v' } }] }] },
    })

    const data = parseResult(result)
    expect(data['error']).toContain('not initialized')

    await rm(emptyDir, { recursive: true, force: true })
  })
})
