import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generate } from '../../src/generator/generate.js'
import { contentrainLoader } from '../../src/astro/loader.js'
import { isPublishedAt } from '../../src/generator/publication.js'

let root: string
const start = '2026-10-01T12:00:00Z'
const end = '2026-10-01T13:00:00Z'
const window = { status: 'published', publish_at: start, expire_at: end }
async function json(path: string, value: unknown) {
  const file = join(root, '.contentrain', path)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, JSON.stringify(value))
}
async function fixture() {
  root = await mkdtemp(join(tmpdir(), 'publication-'))
  await json('config.json', { version: 1, locales: { default: 'en', supported: ['en', 'tr'] } })
  await writeFile(join(root, 'package.json'), '{}')
  for (const [id, kind] of [['posts', 'collection'], ['labels', 'dictionary'], ['settings', 'singleton'], ['article', 'document']]) {
    await json(`models/${id}.json`, { id, name: id, kind, domain: 'blog', i18n: true, fields: {} })
  }
  await json('content/blog/posts/en.json', { scheduled: { title: 'Scheduled' }, draft: { title: 'Secret' }, legacy: { title: 'Legacy' } })
  await json('content/blog/posts/tr.json', { scheduled: { title: 'Private translation' } })
  await json('meta/posts/en.json', { scheduled: window, draft: { status: 'draft' } })
  await json('meta/posts/tr.json', { scheduled: { status: 'draft' } })
  await json('content/blog/labels/en.json', { scheduled: 'Visible label', draft: 'Secret label' })
  await json('meta/labels/en.json', { scheduled: window, draft: { status: 'draft' } })
  await json('content/blog/settings/en.json', { title: 'Settings' })
  await json('meta/settings/en.json', window)
  await mkdir(join(root, '.contentrain/content/blog/article/intro'), { recursive: true })
  await writeFile(join(root, '.contentrain/content/blog/article/intro/en.md'), '---\ntitle: Article\n---\nDocument body')
  await json('meta/article/intro/en.json', window)
}
async function load(model: string, at: string) {
  const entries: string[] = []
  await contentrainLoader({ root, model, locale: 'en', at }).load({ store: { clear() {}, set(entry) { entries.push(entry.id) } } })
  return entries.toSorted()
}
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }) })

describe('public build publication windows', () => {
  it('generator and Astro loader agree before, at, and after both boundaries for all model kinds', async () => {
    await fixture()
    for (const [at, visible] of [['2026-10-01T11:59:59Z', false], [start, true], ['2026-10-01T12:30:00Z', true], [end, false]] as const) {
      const result = await generate({ projectRoot: root, at })
      const data = async (name: string) => JSON.parse((await readFile(join(root, '.contentrain/client/data', name), 'utf8')).replace(/^export default /, ''))
      const posts = await data('posts.en.mjs')
      expect(posts.map((p: { id: string }) => p.id)).toEqual(visible ? ['legacy', 'scheduled'] : ['legacy'])
      expect(await load('posts', at)).toEqual(posts.map((p: { id: string }) => p.id))
      expect(await data('posts.tr.mjs')).toEqual([])
      expect(Object.keys(await data('labels.en.mjs'))).toEqual(visible ? ['scheduled'] : [])
      expect(await load('labels', at)).toEqual(visible ? ['scheduled'] : [])
      expect(result.generatedFiles.includes('data/settings.en.mjs')).toBe(visible)
      expect(await load('settings', at)).toEqual(visible ? ['settings'] : [])
      expect(result.generatedFiles.includes('data/article--intro.en.mjs')).toBe(visible)
      expect(await load('article', at)).toEqual(visible ? ['intro'] : [])
    }
    // Expired modules must also be removed from disk after a previously visible build.
    await expect(readFile(join(root, '.contentrain/client/data/settings.en.mjs'))).rejects.toThrow()
  })

  it('keeps editorial generation unchanged and refuses invalid build time or corrupt metadata', async () => {
    await fixture()
    await generate({ projectRoot: root })
    expect(await readFile(join(root, '.contentrain/client/data/posts.en.mjs'), 'utf8')).toContain('Secret')
    await expect(generate({ projectRoot: root, at: 'not-a-date' })).rejects.toThrow('timestamp')
    await json('meta/posts/en.json', [])
    await expect(generate({ projectRoot: root, at: start })).rejects.toThrow('metadata')
  })

  it('never publishes invalid schedules or non-published workflow states', () => {
    for (const status of ['draft', 'in_review', 'rejected', 'archived']) expect(isPublishedAt({ status }, Date.parse(start))).toBe(false)
    expect(isPublishedAt({ status: 'published', publish_at: 'bad-date' }, Date.parse(start))).toBe(false)
    expect(isPublishedAt({ status: 'published', expire_at: 'bad-date' }, Date.parse(start))).toBe(false)
    expect(isPublishedAt(undefined, Date.parse(start))).toBe(true)
  })
})
