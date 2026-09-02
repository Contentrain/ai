import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { validateProject } from '../../../src/core/validator/index.js'
import { writeJson, contentrainDir } from '../../../src/util/fs.js'

// Disk-backed: the repair writes the model JSON, so only the projectRoot flow
// exercises it (a reader-backed caller forces fix:false).

let testDir: string

const CONFIG = {
  version: 1,
  stack: 'nuxt',
  workflow: 'review',
  locales: { default: 'en', supported: ['en'] },
  domains: ['blog'],
}

/** A model as it exists in a project authored before title_field was required. */
const LEGACY_MODEL: Record<string, unknown> = {
  id: 'posts',
  name: 'Posts',
  kind: 'collection',
  domain: 'blog',
  i18n: false,
  fields: {
    cover: { type: 'image' },
    excerpt: { type: 'text' },
    title: { type: 'string', required: true },
  },
}

async function seed(model: Record<string, unknown>): Promise<void> {
  const cr = contentrainDir(testDir)
  await writeJson(join(cr, 'config.json'), CONFIG)
  await writeJson(join(cr, 'models', `${String(model['id'])}.json`), model)
  await writeJson(join(cr, 'content', 'blog', String(model['id']), 'data.json'), {})
}

const readModelRaw = async (id: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(join(contentrainDir(testDir), 'models', `${id}.json`), 'utf-8')) as Record<string, unknown>

const titleIssues = (issues: Array<{ field?: string }>) => issues.filter(i => i.field === 'title_field')

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-title-field-fix-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('validateProject — title_field', () => {
  describe('report', () => {
    it('fails a legacy model and names the property', async () => {
      await seed(LEGACY_MODEL)

      const result = await validateProject(testDir, {})

      expect(result.valid).toBe(false)
      const issues = titleIssues(result.issues)
      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({ severity: 'error', model: 'posts' })
      expect(issues[0]!.message).toContain('Missing "title_field"')
      expect(result.fixed).toBe(0)
    })

    it('leaves a valid model alone', async () => {
      await seed({ ...LEGACY_MODEL, title_field: 'title' })

      const result = await validateProject(testDir, {})

      expect(titleIssues(result.issues)).toEqual([])
    })
  })

  describe('fix', () => {
    it('backfills the field and reports which rule chose it', async () => {
      await seed(LEGACY_MODEL)

      const result = await validateProject(testDir, { fix: true })

      expect(result.fixed).toBe(1)
      const notices = result.issues.filter(i => i.severity === 'notice' && i.field === 'title_field')
      expect(notices).toHaveLength(1)
      expect(notices[0]!.message).toContain('title_field set to "title"')
      expect(notices[0]!.message).toContain('rule: name-match')
      // The notice has to say how to overrule it, or the pick is invisible judgement.
      expect(notices[0]!.message).toContain('contentrain_model_save')
    })

    it('writes title_field in its canonical position, after i18n', async () => {
      await seed(LEGACY_MODEL)

      await validateProject(testDir, { fix: true })

      const written = await readModelRaw('posts')
      expect(written['title_field']).toBe('title')
      const keys = Object.keys(written)
      expect(keys.indexOf('title_field')).toBe(keys.indexOf('i18n') + 1)
      expect(keys.indexOf('title_field')).toBeLessThan(keys.indexOf('fields'))
    })

    it('leaves the project clean on a second pass', async () => {
      await seed(LEGACY_MODEL)

      await validateProject(testDir, { fix: true })
      const after = await validateProject(testDir, {})

      expect(titleIssues(after.issues)).toEqual([])
      expect(after.summary.errors).toBe(0)
    })

    it('resolves a dictionary to the reserved key sentinel', async () => {
      await seed({ id: 'ui-strings', name: 'UI Strings', kind: 'dictionary', domain: 'blog', i18n: false })

      const result = await validateProject(testDir, { fix: true })

      expect(result.fixed).toBe(1)
      expect((await readModelRaw('ui-strings'))['title_field']).toBe('key')
    })

    // The repair is a backfill, not a correction. Choosing a different field than
    // the author named would be overruling a decision, not filling a gap.
    it('does not touch a title_field that points at the wrong field', async () => {
      await seed({ ...LEGACY_MODEL, title_field: 'cover' })

      const result = await validateProject(testDir, { fix: true })

      expect(result.fixed).toBe(0)
      const issues = titleIssues(result.issues)
      expect(issues[0]!.severity).toBe('error')
      expect(issues[0]!.message).toContain('has type "image"')
      expect((await readModelRaw('posts'))['title_field']).toBe('cover')
    })

    it('does not touch a title_field naming a field that does not exist', async () => {
      await seed({ ...LEGACY_MODEL, title_field: 'headline' })

      const result = await validateProject(testDir, { fix: true })

      expect(result.fixed).toBe(0)
      expect(titleIssues(result.issues)[0]!.message).toContain('is not defined in fields')
    })

    // #120: name-likeness used to outrank requiredness, so `authors` — optional
    // `title` holding the job title, required `name` holding the person — was
    // backfilled with `title`, and the very next `validate` warned about the
    // optional pick it had just made.
    it('prefers a required name-like field over an optional one', async () => {
      await seed({
        id: 'authors',
        name: 'Authors',
        kind: 'collection',
        domain: 'blog',
        i18n: false,
        fields: {
          title: { type: 'string' },
          name: { type: 'string', required: true, max: 80 },
          slug: { type: 'slug', required: true, unique: true },
        },
      })

      const result = await validateProject(testDir, { fix: true })

      expect(result.fixed).toBe(1)
      expect((await readModelRaw('authors'))['title_field']).toBe('name')
      // What --fix writes must not be what validate then warns about.
      const after = await validateProject(testDir, {})
      expect(titleIssues(after.issues)).toEqual([])
    })

    // #120: a singleton whose only displayable field was `whatsapp_url` was
    // backfilled with it, so every Studio row read as a WhatsApp link. A URL is
    // a legal title_field when an author names it — never when guessed.
    it('does not backfill a url field, and names the legal choices instead', async () => {
      await seed({
        id: 'site-settings',
        name: 'Site Settings',
        kind: 'singleton',
        domain: 'blog',
        i18n: false,
        fields: {
          header_categories: { type: 'relations', model: 'categories' },
          footer_columns: { type: 'array' },
          whatsapp_url: { type: 'url' },
        },
      })

      const result = await validateProject(testDir, { fix: true })

      expect(result.fixed).toBe(0)
      const issues = titleIssues(result.issues)
      expect(issues[0]!.severity).toBe('error')
      expect(issues[0]!.message).toContain('"whatsapp_url"')
      expect(issues[0]!.message).toContain('contentrain_model_save')
      expect(await readModelRaw('site-settings')).not.toHaveProperty('title_field')
    })

    // Guessing `cover` here would re-create the bug the property exists to fix.
    it('reports rather than guesses when no field can be a title', async () => {
      await seed({
        id: 'gallery',
        name: 'Gallery',
        kind: 'collection',
        domain: 'blog',
        i18n: false,
        fields: { cover: { type: 'image' }, rank: { type: 'number' } },
      })

      const result = await validateProject(testDir, { fix: true })

      expect(result.fixed).toBe(0)
      const issues = titleIssues(result.issues)
      expect(issues[0]!.severity).toBe('error')
      expect(issues[0]!.message).toContain('no field can serve as one')
      expect(await readModelRaw('gallery')).not.toHaveProperty('title_field')
    })
  })
})
