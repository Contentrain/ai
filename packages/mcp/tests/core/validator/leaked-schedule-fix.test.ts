import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { EntryMeta } from '@contentrain/types'
import { validateProject } from '../../../src/core/validator/index.js'
import { parseFrontmatter, serializeFrontmatter } from '../../../src/core/content-manager.js'
import { contentrainDir, writeJson, writeText } from '../../../src/util/fs.js'

/**
 * #125 — `contentrain_content_save` merged `publish_at` into the entry's data
 * before planning the write, so the date landed in the document's frontmatter
 * as well as in meta. Documents merge frontmatter on save, so no later save
 * could remove it: one exploratory call polluted a content file for good.
 *
 * The save path no longer leaks. This is the repair for files it already did.
 * Disk-backed, because the repair rewrites the document.
 */

let testDir: string

const CONFIG = {
  version: 1,
  stack: 'nuxt',
  workflow: 'review',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['blog'],
}

const MODEL: Record<string, unknown> = {
  id: 'guide-sections',
  name: 'Guide Sections',
  kind: 'document',
  domain: 'blog',
  i18n: true,
  title_field: 'title',
  fields: {
    title: { type: 'string', required: true },
    slug: { type: 'slug', required: true },
  },
}

const META: EntryMeta = {
  status: 'draft',
  source: 'agent',
  updated_by: 'contentrain-mcp',
  updated_at: '2026-08-24T13:15:35.280Z',
  publish_at: '2026-08-01T00:00:00.000Z',
}

const PUBLISH_AT = '2026-08-01T00:00:00.000Z'

const docPath = (locale: string): string =>
  join(contentrainDir(testDir), 'content', 'blog', 'guide-sections', 'instagram-9', `${locale}.md`)
const metaPath = (locale: string): string =>
  join(contentrainDir(testDir), 'meta', 'guide-sections', 'instagram-9', `${locale}.json`)

async function seed(opts: {
  model?: Record<string, unknown>
  frontmatter: Record<string, unknown>
  meta: EntryMeta | null
}): Promise<void> {
  const cr = contentrainDir(testDir)
  await writeJson(join(cr, 'config.json'), CONFIG)
  await writeJson(join(cr, 'models', 'guide-sections.json'), opts.model ?? MODEL)
  await writeText(docPath('tr'), serializeFrontmatter(opts.frontmatter, '# Instagram'))
  await writeText(docPath('en'), serializeFrontmatter({ title: 'Instagram', slug: 'instagram-9' }, '# Instagram'))
  if (opts.meta) await writeJson(metaPath('tr'), opts.meta)
}

const leakIssues = (issues: Array<{ message: string }>) =>
  issues.filter(i => i.message.includes('belong in meta'))

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-leaked-schedule-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('validateProject — scheduling keys leaked into document frontmatter', () => {
  it('warns when the frontmatter carries a publish_at that meta also holds', async () => {
    await seed({ frontmatter: { title: 'Instagram', slug: 'instagram-9', publish_at: PUBLISH_AT }, meta: META })

    const result = await validateProject(testDir, {})

    const issues = leakIssues(result.issues)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'warning', model: 'guide-sections', locale: 'tr', slug: 'instagram-9', field: 'publish_at' })
    expect(issues[0]!.message).toContain('"publish_at"')
    expect(issues[0]!.message).toContain('fix:true')
    // A warning, not an error: the project still validates.
    expect(result.valid).toBe(true)
  })

  it('fix strips the frontmatter copy, keeps the meta value, and leaves the body intact', async () => {
    await seed({ frontmatter: { title: 'Instagram', slug: 'instagram-9', publish_at: PUBLISH_AT }, meta: META })

    const result = await validateProject(testDir, { fix: true })
    expect(result.fixed).toBe(1)

    const { frontmatter, body } = parseFrontmatter(await readFile(docPath('tr'), 'utf-8'))
    expect(frontmatter).toEqual({ title: 'Instagram', slug: 'instagram-9' })
    expect(body.trim()).toBe('# Instagram')
    const meta = JSON.parse(await readFile(metaPath('tr'), 'utf-8')) as EntryMeta
    expect(meta.publish_at).toBe(PUBLISH_AT)
    expect(meta.status).toBe('draft')

    const after = await validateProject(testDir, {})
    expect(leakIssues(after.issues)).toEqual([])
  })

  it('strips expire_at too, when both leaked', async () => {
    await seed({
      frontmatter: { title: 'Instagram', slug: 'instagram-9', publish_at: PUBLISH_AT, expire_at: '2026-09-01T00:00:00.000Z' },
      meta: { ...META, expire_at: '2026-09-01T00:00:00.000Z' },
    })

    const result = await validateProject(testDir, { fix: true })

    expect(result.fixed).toBe(1)
    const { frontmatter } = parseFrontmatter(await readFile(docPath('tr'), 'utf-8'))
    expect(frontmatter).toEqual({ title: 'Instagram', slug: 'instagram-9' })
  })

  // Without the meta counterpart there is no evidence the tool put it there — it
  // is the author's own frontmatter field, and the validator leaves those alone.
  it('leaves an undeclared publish_at alone when meta does not hold it', async () => {
    await seed({
      frontmatter: { title: 'Instagram', slug: 'instagram-9', publish_at: PUBLISH_AT },
      meta: { status: 'draft', source: 'agent', updated_by: 'contentrain-mcp' },
    })

    const result = await validateProject(testDir, { fix: true })

    expect(leakIssues(result.issues)).toEqual([])
    expect(result.fixed).toBe(0)
    const { frontmatter } = parseFrontmatter(await readFile(docPath('tr'), 'utf-8'))
    expect(frontmatter['publish_at']).toBe(PUBLISH_AT)
  })

  it('leaves a publish_at the model declares as a field alone', async () => {
    await seed({
      model: { ...MODEL, fields: { ...(MODEL['fields'] as Record<string, unknown>), publish_at: { type: 'datetime' } } },
      frontmatter: { title: 'Instagram', slug: 'instagram-9', publish_at: PUBLISH_AT },
      meta: META,
    })

    const result = await validateProject(testDir, { fix: true })

    expect(leakIssues(result.issues)).toEqual([])
    expect(result.fixed).toBe(0)
  })
})
