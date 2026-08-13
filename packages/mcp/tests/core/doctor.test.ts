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
  await git.addConfig('user.email', 'ai@contentrain.io')
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
    title_field: 'title',
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
    expect(report.checks.find(c => c.name === 'Unused dictionary keys')).toBeUndefined()
  })

  it('adds the usage block + 3 extra checks when { usage: true }', async () => {
    await seedMinimalProject(testDir)
    const report = await runDoctor(testDir, { usage: true })
    expect(report.usage).toBeDefined()
    expect(Array.isArray(report.usage?.unusedKeys)).toBe(true)
    expect(Array.isArray(report.usage?.duplicateValues)).toBe(true)
    expect(Array.isArray(report.usage?.missingLocaleKeys)).toBe(true)

    const usageCheckNames = report.checks.filter(c =>
      ['Unused dictionary keys', 'Duplicate dictionary values', 'Locale key coverage'].includes(c.name),
    ).map(c => c.name)
    expect(usageCheckNames).toEqual([
      'Unused dictionary keys',
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

  // `generate` rewrites the client files in place, which never moves the client
  // directory's own mtime — so a directory-vs-directory comparison stayed stale
  // forever once a model save had bumped .contentrain/models.
  it('clears the stale warning after an in-place regenerate', async () => {
    await seedMinimalProject(testDir)
    const clientDir = join(testDir, '.contentrain', 'client')
    await mkdir(join(clientDir, 'data'), { recursive: true })
    await writeFileSafe(join(clientDir, 'index.mjs'), '// generated\n')
    await writeFileSafe(join(clientDir, 'data', 'posts.mjs'), 'export default {}\n')

    await new Promise(r => setTimeout(r, 20))
    await writeFileSafe(join(testDir, '.contentrain', 'models', 'new-model.json'), JSON.stringify({
      id: 'new-model', name: 'New', kind: 'singleton', domain: 'marketing', fields: {},
    }))
    expect((await runDoctor(testDir)).checks.find(c => c.name === 'SDK client')?.pass).toBe(false)

    // Re-run generate: same files, new contents. The directory mtime does not move.
    await new Promise(r => setTimeout(r, 20))
    await writeFileSafe(join(clientDir, 'index.mjs'), '// regenerated\n')

    const sdk = (await runDoctor(testDir)).checks.find(c => c.name === 'SDK client')
    expect(sdk?.pass).toBe(true)
    expect(sdk?.detail).toBe('Up to date')
  })

  it('treats a nested data file as evidence of a fresh client', async () => {
    await seedMinimalProject(testDir)
    const clientDir = join(testDir, '.contentrain', 'client')
    await mkdir(join(clientDir, 'data'), { recursive: true })
    await writeFileSafe(join(clientDir, 'index.mjs'), '// generated\n')

    await new Promise(r => setTimeout(r, 20))
    await writeFileSafe(join(testDir, '.contentrain', 'models', 'new-model.json'), JSON.stringify({
      id: 'new-model', name: 'New', kind: 'singleton', domain: 'marketing', fields: {},
    }))

    // Only a nested emitted file is newer — the check must still see it.
    await new Promise(r => setTimeout(r, 20))
    await writeFileSafe(join(clientDir, 'data', 'new-model.mjs'), 'export default {}\n')

    expect((await runDoctor(testDir)).checks.find(c => c.name === 'SDK client')?.pass).toBe(true)
  })
})

describe('runDoctor — Remote branches check', () => {
  const extraDirs: string[] = []

  afterEach(async () => {
    await Promise.all(extraDirs.splice(0).map(d => rm(d, { recursive: true, force: true })))
  })

  it('omits the check when no remote is configured', async () => {
    await seedMinimalProject(testDir)
    const report = await runDoctor(testDir)
    expect(report.checks.find(c => c.name === 'Remote branches')).toBeUndefined()
  })

  it('reports the remote cr/* count', async () => {
    await seedMinimalProject(testDir)
    const { addBareRemote } = await import('../fixtures/bare-remote.js')
    extraDirs.push(await addBareRemote(testDir))
    const git = simpleGit(testDir)
    await git.branch(['cr/content/blog/1'])
    await git.push('origin', 'cr/content/blog/1')

    const report = await runDoctor(testDir)

    const check = report.checks.find(c => c.name === 'Remote branches')
    expect(check).toBeDefined()
    expect(check?.pass).toBe(true)
    expect(check?.detail).toContain('1 cr/* branch(es) on origin')
  })

  it('degrades to an informational check when the remote is unreachable', async () => {
    await seedMinimalProject(testDir)
    const git = simpleGit(testDir)
    await git.addRemote('origin', join(testDir, 'no-such-remote'))

    const report = await runDoctor(testDir)

    const check = report.checks.find(c => c.name === 'Remote branches')
    expect(check).toBeDefined()
    expect(check?.pass).toBe(true)
    expect(check?.severity).toBe('info')
    expect(check?.detail).toContain('Could not check')
  })
})

/**
 * The Models check used to report "all valid" on the strength of JSON.parse.
 * Model reads are unvalidated casts, so a definition can be structurally wrong
 * and still load — which is precisely the state every project is in the moment
 * title_field becomes required.
 */
describe('runDoctor — Models check', () => {
  const writeModelJson = (id: string, model: Record<string, unknown>) =>
    writeFileSafe(join(testDir, '.contentrain', 'models', `${id}.json`), JSON.stringify(model, null, 2))

  it('fails on a model missing title_field and names it', async () => {
    await seedMinimalProject(testDir)
    await writeModelJson('legacy', {
      id: 'legacy',
      name: 'Legacy',
      kind: 'collection',
      domain: 'marketing',
      i18n: false,
      fields: { title: { type: 'string', required: true } },
    })

    const report = await runDoctor(testDir)
    const models = report.checks.find(c => c.name === 'Models')

    expect(models?.pass).toBe(false)
    expect(models?.severity).toBe('error')
    expect(models?.detail).toContain('legacy')
    // A health check that reports a problem without its remedy just worries you.
    expect(models?.detail).toContain('contentrain validate --fix')
  })

  it('distinguishes an unparseable model from an invalid one', async () => {
    await seedMinimalProject(testDir)
    await writeFileSafe(join(testDir, '.contentrain', 'models', 'broken.json'), '{ not json')

    const report = await runDoctor(testDir)
    const models = report.checks.find(c => c.name === 'Models')

    expect(models?.pass).toBe(false)
    expect(models?.detail).toContain('failed to parse')
  })

  it('omits severity when every model is valid', async () => {
    await seedMinimalProject(testDir)

    const report = await runDoctor(testDir)
    const models = report.checks.find(c => c.name === 'Models')

    expect(models?.pass).toBe(true)
    expect(models?.detail).toContain('all valid')
    expect(models?.severity).toBeUndefined()
  })
})

/**
 * `--usage` reports keys that source code should have referenced but did not.
 * That question only has an answer for dictionaries.
 */
describe('runDoctor --usage — unused keys', () => {
  it('reports a dictionary key that no source file references', async () => {
    await seedMinimalProject(testDir)
    await writeFileSafe(join(testDir, '.contentrain', 'models', 'ui-strings.json'), JSON.stringify({
      id: 'ui-strings', name: 'UI Strings', kind: 'dictionary', domain: 'marketing', i18n: true, title_field: 'key',
    }, null, 2))
    await writeFileSafe(
      join(testDir, '.contentrain', 'content', 'marketing', 'ui-strings', 'en.json'),
      JSON.stringify({ 'nav.home': 'Home', 'nav.gone': 'Nobody calls me' }, null, 2),
    )
    await writeFileSafe(join(testDir, 'src', 'App.tsx'), `export const A = () => t('nav.home')\n`)

    const report = await runDoctor(testDir, { usage: true })

    const keys = report.usage!.unusedKeys.map(k => k.key)
    expect(keys).toContain('nav.gone')
    expect(keys).not.toContain('nav.home')
  })

  // Entries are fetched by query — a hex entry id or a document slug will never
  // appear in a source file, so flagging them buried the real findings.
  it('does not flag collection entry ids or document slugs', async () => {
    await seedMinimalProject(testDir)
    await writeFileSafe(join(testDir, '.contentrain', 'models', 'articles.json'), JSON.stringify({
      id: 'articles', name: 'Articles', kind: 'collection', domain: 'marketing', i18n: true,
      title_field: 'title', fields: { title: { type: 'string', required: true } },
    }, null, 2))
    await writeFileSafe(
      join(testDir, '.contentrain', 'content', 'marketing', 'articles', 'en.json'),
      JSON.stringify({ '0a1b2c3d4e5f': { title: 'Never referenced by id' } }, null, 2),
    )
    await writeFileSafe(join(testDir, 'src', 'App.tsx'), `export const A = () => null\n`)

    const report = await runDoctor(testDir, { usage: true })

    expect(report.usage!.unusedKeys.map(k => k.model)).not.toContain('articles')
  })
})
