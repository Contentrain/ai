import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { simpleGit } from 'simple-git'
import { runDoctor } from '../../src/core/doctor.js'

async function writeFileSafe(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

let testDir: string

async function seedMinimalProject(root: string) {
  const git = simpleGit(root)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@contentrain.io')
  await writeFileSafe(join(root, 'README.md'), '# test\n')
  await git.add('.')
  await git.commit('initial')

  await writeFileSafe(join(root, '.contentrain', 'config.json'), JSON.stringify({
    version: 1,
    stack: 'nuxt',
    workflow: 'auto-merge',
    locales: { default: 'en', supported: ['en', 'tr'] },
    domains: ['marketing'],
  }, null, 2))

  await mkdir(join(root, '.contentrain', 'models'), { recursive: true })
  await writeFileSafe(join(root, '.contentrain', 'models', 'hero.json'), JSON.stringify({
    id: 'hero',
    name: 'Hero',
    kind: 'singleton',
    domain: 'marketing',
    fields: { title: { type: 'string', required: true } },
  }, null, 2))

  await mkdir(join(root, '.contentrain', 'content', 'marketing', 'hero'), { recursive: true })
  await writeFileSafe(
    join(root, '.contentrain', 'content', 'marketing', 'hero', 'en.json'),
    JSON.stringify({ title: 'Welcome' }, null, 2),
  )
  await writeFileSafe(
    join(root, '.contentrain', 'content', 'marketing', 'hero', 'tr.json'),
    JSON.stringify({ title: 'Hoşgeldin' }, null, 2),
  )
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-doctor-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('runDoctor', () => {
  it('reports an uninitialised project', async () => {
    const git = simpleGit(testDir)
    await git.init()

    const report = await runDoctor(testDir)

    const structure = report.checks.find(c => c.name === '.contentrain/ structure')
    expect(structure).toBeDefined()
    expect(structure?.pass).toBe(false)
    expect(structure?.detail).toMatch(/Not initialized/u)
    expect(structure?.severity).toBe('error')
  })

  it('passes a minimal valid project on the base checks', async () => {
    await seedMinimalProject(testDir)
    const report = await runDoctor(testDir)

    const passed = report.checks.filter(c => c.pass).map(c => c.name)
    expect(passed).toContain('Git')
    expect(passed).toContain('Git repository')
    expect(passed).toContain('.contentrain/ structure')
    expect(passed).toContain('Config')
    expect(passed).toContain('Models')
    expect(passed).toContain('Orphan content')

    expect(report.summary.total).toBe(report.checks.length)
    expect(report.summary.passed + report.summary.failed).toBe(report.summary.total)
  })

  it('flags orphan content directories with warning severity', async () => {
    await seedMinimalProject(testDir)
    // An unmodelled content directory — orphan.
    await mkdir(join(testDir, '.contentrain', 'content', 'marketing', 'stranger'), { recursive: true })
    await writeFileSafe(
      join(testDir, '.contentrain', 'content', 'marketing', 'stranger', 'en.json'),
      '{}\n',
    )

    const report = await runDoctor(testDir)
    const orphan = report.checks.find(c => c.name === 'Orphan content')
    expect(orphan?.pass).toBe(false)
    expect(orphan?.severity).toBe('warning')
    expect(orphan?.detail).toContain('marketing/stranger')
  })

  it('omits the usage block by default', async () => {
    await seedMinimalProject(testDir)
    const report = await runDoctor(testDir)
    expect(report.usage).toBeUndefined()
    expect(report.checks.find(c => c.name === 'Unused content keys')).toBeUndefined()
  })

  it('adds the usage block + 3 extra checks when { usage: true }', async () => {
    await seedMinimalProject(testDir)
    const report = await runDoctor(testDir, { usage: true })
    expect(report.usage).toBeDefined()
    expect(Array.isArray(report.usage?.unusedKeys)).toBe(true)
    expect(Array.isArray(report.usage?.duplicateValues)).toBe(true)
    expect(Array.isArray(report.usage?.missingLocaleKeys)).toBe(true)

    const usageCheckNames = report.checks.filter(c =>
      ['Unused content keys', 'Duplicate dictionary values', 'Locale key coverage'].includes(c.name),
    ).map(c => c.name)
    expect(usageCheckNames).toEqual([
      'Unused content keys',
      'Duplicate dictionary values',
      'Locale key coverage',
    ])
  })

  it('flags a stale SDK client (models dir newer than client dir) as a warning', async () => {
    await seedMinimalProject(testDir)
    // Create client BEFORE touching models so client's mtime is older.
    const clientDir = join(testDir, '.contentrain', 'client')
    await mkdir(clientDir, { recursive: true })
    await writeFileSafe(join(clientDir, 'index.mjs'), '// generated\n')
    // Wait a tick so the next mkdir/write produces a strictly newer mtime.
    await new Promise(r => setTimeout(r, 20))
    await writeFileSafe(join(testDir, '.contentrain', 'models', 'new-model.json'), JSON.stringify({
      id: 'new-model', name: 'New', kind: 'singleton', domain: 'marketing', fields: {},
    }))

    const report = await runDoctor(testDir)
    const sdk = report.checks.find(c => c.name === 'SDK client')
    expect(sdk).toBeDefined()
    expect(sdk?.pass).toBe(false)
    expect(sdk?.severity).toBe('warning')
  })
})
