import { describe, expect, it } from 'vitest'
import type { ContentrainConfig, EntryMeta, ModelDefinition, RepoReader } from '@contentrain/types'
import { planContentSave } from '../../src/core/ops/content-save.js'

const config: ContentrainConfig = {
  version: 1,
  stack: 'other',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en'] },
  domains: ['blog'],
}

/** A reader backed by an in-memory path→contents map; anything absent throws, as a real reader would. */
function readerOf(files: Record<string, unknown>): RepoReader {
  return {
    readFile: async (path: string) => {
      if (!(path in files)) throw new Error(`not found: ${path}`)
      return JSON.stringify(files[path])
    },
  } as unknown as RepoReader
}

function metaChange(plan: Awaited<ReturnType<typeof planContentSave>>): Record<string, unknown> {
  const change = plan.changes.find(ch => ch.path.includes('/meta/'))
  if (!change) throw new Error('no meta change in plan')
  return JSON.parse(change.content) as Record<string, unknown>
}

/** The content (not meta) change with the given extension, as written. */
function contentChange(plan: Awaited<ReturnType<typeof planContentSave>>, ext: string): string {
  const change = plan.changes.find(ch => !ch.path.includes('/meta/') && ch.path.endsWith(ext))
  if (!change) throw new Error(`no ${ext} content change in plan`)
  return change.content
}

const published: EntryMeta = {
  status: 'published',
  source: 'human',
  updated_by: 'author@example.com',
  approved_by: 'editor@example.com',
  version: '2',
}

describe('planContentSave meta status preservation', () => {
  const singleton: ModelDefinition = {
    id: 'hero', name: 'Hero', kind: 'singleton', domain: 'blog', i18n: true, title_field: 'title',
    fields: { title: { type: 'string' } },
  }
  const collection: ModelDefinition = {
    id: 'posts', name: 'Posts', kind: 'collection', domain: 'blog', i18n: true, title_field: 'title',
    fields: { title: { type: 'string' } },
  }
  const dictionary: ModelDefinition = {
    id: 'strings', name: 'Strings', kind: 'dictionary', domain: 'blog', i18n: true, title_field: 'key',
  }
  const document: ModelDefinition = {
    id: 'guides', name: 'Guides', kind: 'document', domain: 'blog', i18n: true, title_field: 'title',
    fields: { title: { type: 'string' }, slug: { type: 'slug' } },
  }

  it('preserves a published singleton status, approval and version', async () => {
    const plan = await planContentSave(
      readerOf({ '.contentrain/meta/hero/en.json': published }),
      { model: singleton, config, entries: [{ locale: 'en', data: { title: 'Edited' } }] },
    )

    const meta = metaChange(plan)
    expect(meta['status']).toBe('published')
    expect(meta['approved_by']).toBe('editor@example.com')
    expect(meta['version']).toBe('2')
    // Provenance reflects this write, so it is restamped.
    expect(meta['source']).toBe('agent')
    expect(meta['updated_by']).toBe('contentrain-mcp')
  })

  it('preserves a published collection entry and leaves siblings untouched', async () => {
    const plan = await planContentSave(
      readerOf({
        '.contentrain/content/blog/posts/en.json': { aaa111bbb222: { title: 'Old' } },
        '.contentrain/meta/posts/en.json': {
          aaa111bbb222: published,
          ccc333ddd444: { status: 'archived', source: 'human', updated_by: 'b@example.com' },
        },
      }),
      { model: collection, config, entries: [{ id: 'aaa111bbb222', locale: 'en', data: { title: 'New' } }] },
    )

    expect(plan.result[0]!.action).toBe('updated')
    const meta = metaChange(plan) as Record<string, Record<string, unknown>>
    expect(meta['aaa111bbb222']!['status']).toBe('published')
    expect(meta['ccc333ddd444']!['status']).toBe('archived')
    expect(meta['ccc333ddd444']!['updated_by']).toBe('b@example.com')
  })

  it('starts a new collection entry as draft', async () => {
    const plan = await planContentSave(
      readerOf({}),
      { model: collection, config, entries: [{ locale: 'en', data: { title: 'Fresh' } }] },
    )

    expect(plan.result[0]!.action).toBe('created')
    const id = plan.result[0]!.id!
    const meta = metaChange(plan) as Record<string, Record<string, unknown>>
    expect(meta[id]!['status']).toBe('draft')
  })

  it('preserves a published dictionary status', async () => {
    const plan = await planContentSave(
      readerOf({ '.contentrain/meta/strings/en.json': published }),
      { model: dictionary, config, entries: [{ locale: 'en', data: { 'a.b': 'value' } }] },
    )

    expect(metaChange(plan)['status']).toBe('published')
  })

  it('preserves a published document status', async () => {
    const plan = await planContentSave(
      readerOf({ '.contentrain/meta/guides/hello/en.json': published }),
      { model: document, config, entries: [{ slug: 'hello', locale: 'en', data: { title: 'Hi', body: 'v2' } }] },
    )

    expect(metaChange(plan)['status']).toBe('published')
  })

  // Scheduling rides on the entry, never inside `data`. Merging it into data is
  // what wrote `publish_at` into document frontmatter and collection JSON — and
  // for documents, which merge frontmatter on save, nothing could remove it
  // again (#125). Three states per key: a string sets, `null` clears, an absent
  // key leaves meta alone.
  describe('scheduling', () => {
    it('applies an incoming publish_at to meta without clobbering the preserved status', async () => {
      const plan = await planContentSave(
        readerOf({ '.contentrain/meta/hero/en.json': published }),
        {
          model: singleton,
          config,
          entries: [{ locale: 'en', data: { title: 'Edited' }, publish_at: '2026-01-01T00:00:00Z' }],
        },
      )

      const meta = metaChange(plan)
      expect(meta['status']).toBe('published')
      expect(meta['publish_at']).toBe('2026-01-01T00:00:00Z')
    })

    it('keeps publish_at out of the document frontmatter and the collection JSON', async () => {
      const doc = await planContentSave(
        readerOf({}),
        {
          model: document,
          config,
          entries: [{ slug: 'hello', locale: 'en', data: { title: 'Hi', body: 'v1' }, publish_at: '2026-08-01T00:00:00.000Z' }],
        },
      )
      expect(contentChange(doc, '.md')).not.toContain('publish_at')
      expect(metaChange(doc)['publish_at']).toBe('2026-08-01T00:00:00.000Z')

      const coll = await planContentSave(
        readerOf({}),
        {
          model: collection,
          config,
          entries: [{ id: 'aaa111bbb222', locale: 'en', data: { title: 'One' }, publish_at: '2026-08-01T00:00:00.000Z', expire_at: '2026-09-01T00:00:00.000Z' }],
        },
      )
      const entries = JSON.parse(contentChange(coll, '.json')) as Record<string, Record<string, unknown>>
      expect(entries['aaa111bbb222']).toEqual({ title: 'One' })
      const meta = metaChange(coll) as Record<string, Record<string, unknown>>
      expect(meta['aaa111bbb222']!['publish_at']).toBe('2026-08-01T00:00:00.000Z')
      expect(meta['aaa111bbb222']!['expire_at']).toBe('2026-09-01T00:00:00.000Z')
    })

    // The report's first surprise: a past publish_at, and the entry still a draft.
    // That is the contract — the date gates delivery of a *published* entry — and
    // the tool now says so; the plan must never flip status on its own.
    it('does not change status, even for a publish_at in the past', async () => {
      const plan = await planContentSave(
        readerOf({ '.contentrain/meta/guides/hello/en.json': { status: 'draft', source: 'agent', updated_by: 'contentrain-mcp' } }),
        {
          model: document,
          config,
          entries: [{ slug: 'hello', locale: 'en', data: { title: 'Hi', body: 'v1' }, publish_at: '2000-01-01T00:00:00.000Z' }],
        },
      )
      expect(metaChange(plan)['status']).toBe('draft')
    })

    it('leaves an existing publish_at alone when the entry does not mention it', async () => {
      const plan = await planContentSave(
        readerOf({ '.contentrain/meta/hero/en.json': { ...published, publish_at: '2026-01-01T00:00:00Z' } }),
        { model: singleton, config, entries: [{ locale: 'en', data: { title: 'Edited' } }] },
      )
      expect(metaChange(plan)['publish_at']).toBe('2026-01-01T00:00:00Z')
    })

    it('clears publish_at and expire_at with null', async () => {
      const plan = await planContentSave(
        readerOf({ '.contentrain/meta/hero/en.json': { ...published, publish_at: '2026-01-01T00:00:00Z', expire_at: '2027-01-01T00:00:00Z' } }),
        { model: singleton, config, entries: [{ locale: 'en', data: { title: 'Edited' }, publish_at: null, expire_at: null }] },
      )
      const meta = metaChange(plan)
      expect(meta).not.toHaveProperty('publish_at')
      expect(meta).not.toHaveProperty('expire_at')
      expect(meta['status']).toBe('published')
    })

    // A model may declare its own `publish_at` field — a datetime the author
    // owns. It stays content, and no longer doubles as a scheduling instruction.
    it('treats a publish_at inside data as an ordinary content field', async () => {
      const plan = await planContentSave(
        readerOf({}),
        { model: singleton, config, entries: [{ locale: 'en', data: { title: 'Hi', publish_at: '2026-01-01T00:00:00Z' } }] },
      )
      expect(JSON.parse(contentChange(plan, '.json'))).toEqual({ title: 'Hi', publish_at: '2026-01-01T00:00:00Z' })
      expect(metaChange(plan)).not.toHaveProperty('publish_at')
    })
  })

  // A non-i18n model keeps all content in one data.json, so it must keep exactly
  // one meta record. Writing meta per locale produced two meta files for one
  // content file, and readers disagreed about which was authoritative.
  describe('non-i18n models pin meta to the default locale', () => {
    const nonI18nConfig: ContentrainConfig = {
      ...config,
      locales: { default: 'tr', supported: ['en', 'tr'] },
    }
    const nonI18nCollection: ModelDefinition = {
      id: 'sponsors', name: 'Sponsors', kind: 'collection', domain: 'blog', i18n: false, title_field: 'title',
      fields: { name: { type: 'string' } },
    }

    it('writes meta to the default locale even when saved under another locale', async () => {
      const plan = await planContentSave(
        readerOf({}),
        {
          model: nonI18nCollection,
          config: nonI18nConfig,
          entries: [{ locale: 'en', data: { name: 'Acme' } }],
        },
      )

      const metaPaths = plan.changes.filter(ch => ch.path.includes('/meta/')).map(ch => ch.path)
      expect(metaPaths).toEqual(['.contentrain/meta/sponsors/tr.json'])
      // Content stays locale-agnostic, as it always did.
      expect(plan.changes.some(ch => ch.path === '.contentrain/content/blog/sponsors/data.json')).toBe(true)
    })

    it('produces a single meta file when the same entry is saved under two locales', async () => {
      const plan = await planContentSave(
        readerOf({}),
        {
          model: nonI18nCollection,
          config: nonI18nConfig,
          entries: [
            { id: 'aaa111bbb222', locale: 'en', data: { name: 'Acme' } },
            { id: 'aaa111bbb222', locale: 'tr', data: { name: 'Acme TR' } },
          ],
        },
      )

      const metaPaths = plan.changes.filter(ch => ch.path.includes('/meta/')).map(ch => ch.path)
      expect(metaPaths).toEqual(['.contentrain/meta/sponsors/tr.json'])
    })

    it('preserves a published non-i18n entry read from the default-locale meta', async () => {
      const plan = await planContentSave(
        readerOf({ '.contentrain/meta/sponsors/tr.json': { aaa111bbb222: published } }),
        {
          model: nonI18nCollection,
          config: nonI18nConfig,
          entries: [{ id: 'aaa111bbb222', locale: 'en', data: { name: 'Acme Edited' } }],
        },
      )

      const meta = metaChange(plan) as Record<string, Record<string, unknown>>
      expect(meta['aaa111bbb222']!['status']).toBe('published')
    })
  })

  it('batches two entries into one meta file without losing either status', async () => {
    const plan = await planContentSave(
      readerOf({
        '.contentrain/meta/posts/en.json': {
          aaa111bbb222: published,
          ccc333ddd444: { status: 'published', source: 'human', updated_by: 'b@example.com' },
        },
      }),
      {
        model: collection,
        config,
        entries: [
          { id: 'aaa111bbb222', locale: 'en', data: { title: 'One' } },
          { id: 'ccc333ddd444', locale: 'en', data: { title: 'Two' } },
        ],
      },
    )

    const meta = metaChange(plan) as Record<string, Record<string, unknown>>
    expect(meta['aaa111bbb222']!['status']).toBe('published')
    expect(meta['ccc333ddd444']!['status']).toBe('published')
  })
})
