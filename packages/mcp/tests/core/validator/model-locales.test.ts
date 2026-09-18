import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { validateProject } from '../../../src/core/validator/index.js'
import { readJson, writeJson, writeText, contentrainDir } from '../../../src/util/fs.js'

/**
 * A partially-translated site used to be unrepresentable. Parity was checked
 * against `config.locales.supported` and nothing else, so a page collection
 * that legitimately exists in one language out of three produced a hard error
 * per untranslated entry — and the only way to clear it was to invent empty
 * translations or drop the locale from the whole project.
 *
 * `model.locales` narrows the check to the locales a model actually covers.
 * These tests hold three properties: the subset is honoured, a model without
 * the field behaves exactly as it did before, and every message says which
 * list it was evaluated against so the reader can tell the two apart.
 */

let testDir: string

const CONFIG = {
  version: 1,
  stack: 'astro',
  workflow: 'review',
  locales: { default: 'en', supported: ['en', 'tr', 'da'] },
  domains: ['site'],
}

async function seedConfig(): Promise<void> {
  await writeJson(join(contentrainDir(testDir), 'config.json'), CONFIG)
}

async function seedModel(model: Record<string, unknown>): Promise<void> {
  await writeJson(join(contentrainDir(testDir), 'models', `${String(model['id'])}.json`), model)
}

/** One collection entry, written into exactly the locales named. */
async function seedCollection(
  modelId: string,
  locales: string[],
  entries: Record<string, Record<string, unknown>>,
): Promise<void> {
  for (const locale of locales) {
    await writeJson(join(contentrainDir(testDir), 'content', 'site', modelId, `${locale}.json`), entries)
    await writeJson(
      join(contentrainDir(testDir), 'meta', modelId, `${locale}.json`),
      Object.fromEntries(Object.keys(entries).map(id => [id, { status: 'published', source: 'agent', updated_by: 'test' }])),
    )
  }
}

async function seedDocument(modelId: string, slug: string, locales: string[]): Promise<void> {
  for (const locale of locales) {
    await writeText(
      join(contentrainDir(testDir), 'content', 'site', modelId, slug, `${locale}.md`),
      `---\ntitle: ${slug}\n---\n\nBody.\n`,
    )
    await writeJson(
      join(contentrainDir(testDir), 'meta', modelId, slug, `${locale}.json`),
      { status: 'published', source: 'agent', updated_by: 'test' },
    )
  }
}

const collectionModel = (locales?: string[]): Record<string, unknown> => ({
  id: 'pages',
  name: 'Pages',
  kind: 'collection',
  domain: 'site',
  i18n: true,
  ...(locales ? { locales } : {}),
  title_field: 'title',
  fields: { title: { type: 'string', required: true } },
})

const documentModel = (locales?: string[]): Record<string, unknown> => ({
  id: 'guides',
  name: 'Guides',
  kind: 'document',
  domain: 'site',
  i18n: true,
  ...(locales ? { locales } : {}),
  title_field: 'title',
  fields: { title: { type: 'string', required: true } },
})

const localeIssues = (issues: { message: string }[]): { message: string }[] =>
  issues.filter(i =>
    i.message.includes('Entry parity')
    || i.message.includes('Missing translation')
    || i.message.includes('Locale file missing'),
  )

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-model-locales-'))
  await seedConfig()
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('validateProject — model.locales narrows locale coverage', () => {
  it('a collection scoped to a subset raises nothing for the locales it does not claim', async () => {
    await seedModel(collectionModel(['en']))
    await seedCollection('pages', ['en'], { a1b2c3: { title: 'About' } })

    const result = await validateProject(testDir, {})

    expect(localeIssues(result.issues)).toEqual([])
    expect(result.summary.errors).toBe(0)
    expect(result.valid).toBe(true)
  })

  it('the same collection without the field still errors on every missing locale — the old behaviour, unchanged', async () => {
    await seedModel(collectionModel())
    await seedCollection('pages', ['en'], { a1b2c3: { title: 'About' } })

    const result = await validateProject(testDir, {})

    const missing = result.issues.filter(i => i.message.includes('Locale file missing'))
    expect(missing.map(i => i.locale).toSorted()).toEqual(['da', 'tr'])
    for (const issue of missing) expect(issue.severity).toBe('error')
    expect(result.valid).toBe(false)
  })

  it('a subset still holds parity inside itself: a locale it claims but has not filled is an error', async () => {
    await seedModel(collectionModel(['en', 'tr']))
    await seedCollection('pages', ['en'], { a1b2c3: { title: 'About' } })
    await seedCollection('pages', ['tr'], {})

    const result = await validateProject(testDir, {})

    const parity = result.issues.filter(i => i.message.includes('Entry parity'))
    expect(parity).toHaveLength(1)
    expect(parity[0]!.severity).toBe('error')
    expect(parity[0]!.locale).toBe('tr')
    // da is outside the model's scope, so it is neither missing nor checked.
    expect(result.issues.some(i => i.locale === 'da')).toBe(false)
  })

  it('a document model keeps warning severity, scoped to its own locales', async () => {
    await seedModel(documentModel(['en', 'tr']))
    await seedDocument('guides', 'intro', ['en'])

    const result = await validateProject(testDir, {})

    const missing = result.issues.filter(i => i.message.includes('Missing translation'))
    expect(missing).toHaveLength(1)
    expect(missing[0]!.severity).toBe('warning')
    expect(missing[0]!.locale).toBe('tr')
    expect(result.summary.errors).toBe(0)
  })

  it('a fully-covered document model raises no missing-translation warning at all', async () => {
    await seedModel(documentModel(['en']))
    await seedDocument('guides', 'intro', ['en'])

    const result = await validateProject(testDir, {})

    expect(result.issues.filter(i => i.message.includes('Missing translation'))).toEqual([])
    expect(result.summary.warnings).toBe(0)
  })

  describe('every message names the list it was evaluated against', () => {
    it('names the model\'s own locales when the model declares them', async () => {
      await seedModel(collectionModel(['en', 'tr']))
      await seedCollection('pages', ['en'], { a1b2c3: { title: 'About' } })
      await seedModel(documentModel(['en', 'da']))
      await seedDocument('guides', 'intro', ['en'])

      const result = await validateProject(testDir, {})

      const missing = result.issues.find(i => i.message.includes('Locale file missing'))!
      expect(missing.message).toBe("Locale file missing: tr.json (checked against the model's own locales [en, tr])")

      const translation = result.issues.find(i => i.message.includes('Missing translation'))!
      expect(translation.message).toContain("checked against the model's own locales [en, da]")
    })

    it('names the project list when the model declares nothing', async () => {
      await seedModel(collectionModel())
      await seedCollection('pages', ['en'], { a1b2c3: { title: 'About' } })
      await seedCollection('pages', ['tr'], {})

      const result = await validateProject(testDir, {})

      const parity = result.issues.find(i => i.message.includes('Entry parity'))!
      expect(parity.message).toBe(
        'Entry parity: entry "a1b2c3" exists in en but missing in tr '
        + "(checked against the project's supported locales [en, tr, da])",
      )
      const missing = result.issues.find(i => i.message.includes('Locale file missing'))!
      expect(missing.message).toContain("the project's supported locales [en, tr, da]")
    })
  })

  describe('the declaration itself is validated', () => {
    it('rejects a locale the project does not support, naming both lists', async () => {
      await seedModel(collectionModel(['en', 'fr']))
      await seedCollection('pages', ['en'], { a1b2c3: { title: 'About' } })

      const result = await validateProject(testDir, {})

      const issue = result.issues.find(i => i.field === 'locales')!
      expect(issue.severity).toBe('error')
      expect(issue.model).toBe('pages')
      expect(issue.message).toContain('"fr"')
      expect(issue.message).toContain('[en, tr, da]')
      expect(result.valid).toBe(false)
    })

    it('says nothing about a valid subset', async () => {
      await seedModel(collectionModel(['en', 'tr']))
      await seedCollection('pages', ['en', 'tr'], { a1b2c3: { title: 'About' } })

      const result = await validateProject(testDir, {})

      expect(result.issues.filter(i => i.field === 'locales')).toEqual([])
      expect(result.summary.errors).toBe(0)
    })
  })

  it('fix never invents a locales value for a model that does not declare one', async () => {
    await seedModel(collectionModel())
    await seedCollection('pages', ['en'], { a1b2c3: { title: 'About' } })

    await validateProject(testDir, { fix: true })

    const saved = await readJson<Record<string, unknown>>(
      join(contentrainDir(testDir), 'models', 'pages.json'),
    )
    expect(saved).not.toBeNull()
    expect('locales' in saved!).toBe(false)
    // The gap is repaired the way it always was — empty locale files, not a
    // narrowed schema that would hide the gap instead.
    expect(await readJson(join(contentrainDir(testDir), 'content', 'site', 'pages', 'tr.json'))).toEqual({})
  })

  it('leaves a declared locales value alone under fix', async () => {
    await seedModel(collectionModel(['en']))
    await seedCollection('pages', ['en'], { a1b2c3: { title: 'About' } })

    await validateProject(testDir, { fix: true })

    const saved = await readJson<Record<string, unknown>>(
      join(contentrainDir(testDir), 'models', 'pages.json'),
    )
    expect(saved!['locales']).toEqual(['en'])
    // Out-of-scope locales are not materialised either.
    expect(await readJson(join(contentrainDir(testDir), 'content', 'site', 'pages', 'tr.json'))).toBeNull()
  })
})
