import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { validateProject } from '../../../src/core/validator/index.js'
import { readJson, writeJson, contentrainDir } from '../../../src/util/fs.js'

// Disk-backed: `validateProject(projectRoot, { fix: true })` writes to disk, so
// these tests exercise the real remediation (the in-memory reader flow forces
// fix:false and can only surface the warning — see status-drift.test.ts).

let testDir: string

const CONFIG = {
  version: 1,
  stack: 'nuxt',
  workflow: 'review',
  locales: { default: 'tr', supported: ['en', 'tr'] },
  domains: ['blog'],
}

const MODEL = {
  id: 'sponsors',
  name: 'Sponsors',
  kind: 'collection',
  domain: 'blog',
  i18n: false,
  fields: { name: { type: 'string' } },
}

const ENTRY = 'aaa111bbb222'

const metaFor = (status: string): Record<string, unknown> => ({
  [ENTRY]: { status, source: 'agent', updated_by: 'x' },
})

async function seed(metaFiles: Record<string, Record<string, unknown>>): Promise<void> {
  const cr = contentrainDir(testDir)
  await writeJson(join(cr, 'config.json'), CONFIG)
  await writeJson(join(cr, 'models', 'sponsors.json'), MODEL)
  await writeJson(join(cr, 'content', 'blog', 'sponsors', 'data.json'), { [ENTRY]: { name: 'ACME' } })
  for (const [file, data] of Object.entries(metaFiles)) {
    await writeJson(join(cr, 'meta', 'sponsors', file), data)
  }
}

const metaPath = (file: string): string => join(contentrainDir(testDir), 'meta', 'sponsors', file)
const mismatch = (issues: { message: string }[]): { message: string }[] =>
  issues.filter(i => i.message.includes('Meta layout mismatch'))

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-stray-meta-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('validate fix:true — non-i18n stray meta', () => {
  it('deletes a stray non-default meta when the default-locale meta is authoritative', async () => {
    await seed({
      'tr.json': metaFor('published'),
      'en.json': metaFor('draft'),
    })

    const result = await validateProject(testDir, { model: 'sponsors', fix: true })
    expect(result.fixed).toBeGreaterThanOrEqual(1)

    // Stray gone; the authoritative default is untouched (its published status
    // is never downgraded to the stray's draft).
    expect(await readJson(metaPath('en.json'))).toBeNull()
    expect(await readJson(metaPath('tr.json'))).toEqual(metaFor('published'))

    // Re-validate: the warning is cleared.
    const after = await validateProject(testDir, { model: 'sponsors' })
    expect(mismatch(after.issues)).toHaveLength(0)
  })

  it('migrates the only record to the default path when no default-locale meta exists', async () => {
    await seed({
      'en.json': metaFor('published'),
    })

    const result = await validateProject(testDir, { model: 'sponsors', fix: true })
    expect(result.fixed).toBeGreaterThanOrEqual(1)

    // The record is preserved at the default path — its published status is not
    // clobbered by a fabricated draft, and the stray is removed.
    expect(await readJson(metaPath('en.json'))).toBeNull()
    expect(await readJson(metaPath('tr.json'))).toEqual(metaFor('published'))

    const after = await validateProject(testDir, { model: 'sponsors' })
    expect(mismatch(after.issues)).toHaveLength(0)
  })

  it('leaves ambiguous multiple strays untouched and never fabricates a default (no trap)', async () => {
    await seed({
      'en.json': metaFor('published'),
      'de.json': metaFor('draft'),
    })

    const result = await validateProject(testDir, { model: 'sponsors', fix: true })

    // Ambiguous: no default to defer to and >1 stray, so nothing is consolidated
    // and — crucially — no draft default is minted (which a later pass would use
    // to justify deleting the real published record).
    expect(await readJson(metaPath('en.json'))).toEqual(metaFor('published'))
    expect(await readJson(metaPath('de.json'))).toEqual(metaFor('draft'))
    expect(await readJson(metaPath('tr.json'))).toBeNull()
    expect(mismatch(result.issues)).toHaveLength(1)

    // Idempotent: a second fix pass still changes nothing and loses no data.
    await validateProject(testDir, { model: 'sponsors', fix: true })
    expect(await readJson(metaPath('en.json'))).toEqual(metaFor('published'))
    expect(await readJson(metaPath('de.json'))).toEqual(metaFor('draft'))
    expect(await readJson(metaPath('tr.json'))).toBeNull()
  })

  it('does not touch an i18n model with legitimate per-locale meta', async () => {
    const cr = contentrainDir(testDir)
    await writeJson(join(cr, 'config.json'), CONFIG)
    await writeJson(join(cr, 'models', 'guides.json'), {
      id: 'guides', name: 'Guides', kind: 'collection', domain: 'blog', i18n: true,
      fields: { title: { type: 'string' } },
    })
    await writeJson(join(cr, 'content', 'blog', 'guides', 'tr.json'), { [ENTRY]: { title: 'x' } })
    await writeJson(join(cr, 'content', 'blog', 'guides', 'en.json'), { [ENTRY]: { title: 'x' } })
    await writeJson(join(cr, 'meta', 'guides', 'tr.json'), metaFor('published'))
    await writeJson(join(cr, 'meta', 'guides', 'en.json'), metaFor('published'))

    const result = await validateProject(testDir, { model: 'guides', fix: true })
    expect(result.issues.filter(i => i.message.includes('Meta layout mismatch'))).toHaveLength(0)
    expect(await readJson(join(cr, 'meta', 'guides', 'en.json'))).toEqual(metaFor('published'))
    expect(await readJson(join(cr, 'meta', 'guides', 'tr.json'))).toEqual(metaFor('published'))
  })
})
