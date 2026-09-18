import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'
import type { SourceDeltaPlan } from '@contentrain/types'
import type { DeltaStore } from './delta'
import { formatSourceDeltaReport, planSourceDelta } from './delta'

// Fixtures are the Bridge's own output (fixtures/README.md): the B-11 e2e
// pair — the store delivered at T0, the export at T1 and the delta between
// them — and B-06's twelve-mutation delta, which no store accompanies.

const FIXTURES = join(import.meta.dirname, 'fixtures')

/** A fixture directory as a store: its files under `.contentrain/`, and its entry-source-map.json beside them. */
function loadStore(dir: string): DeltaStore {
  const files: Record<string, string> = {}
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name !== 'entry-source-map.json') files[`.contentrain/${relative(dir, path)}`] = readFileSync(path, 'utf8')
    }
  }
  walk(dir)
  return { files, entry_source_map: JSON.parse(readFileSync(join(dir, 'entry-source-map.json'), 'utf8')) }
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(FIXTURES, path), 'utf8')) as T

const e2eDelta = () => readJson<SourceDeltaPlan>('bridge-e2e/t1.delta.json')
const t0 = () => loadStore(join(FIXTURES, 'bridge-e2e/t0'))
const t1 = () => loadStore(join(FIXTURES, 'bridge-e2e/t1'))
const b06Delta = () => readJson<SourceDeltaPlan>('bridge-b06/delta.json')

const META_62 = '.contentrain/meta/wp-post/entry-62/en-us.json'

/** A minimal delta around hand-written entries, for the store shapes the Bridge fixtures do not cover. */
const handDelta = (entries: SourceDeltaPlan['entries']): SourceDeltaPlan =>
  ({ version: 1, generated_at: '2026-09-18T00:00:00Z', cursor: { kind: 'bridge_inventory', taken_at: '2026-09-18T00:00:00Z' }, entries, deletions_detectable: true })

describe('planSourceDelta — the Bridge e2e delivery', () => {
  it('places every record, lists the changed fields and proposes the redirect', () => {
    const delta = e2eDelta()
    const [updated, moved, deleted] = delta.entries
    const place = { model: 'wp-post', locale: 'en-us' }
    expect(planSourceDelta({ delta, store: t0(), incoming: t1() })).toEqual({
      ...delta,
      entries: [
        { ...updated, ...place, entry_id: 'entry-62', fields_changed: ['body', 'modified'] },
        { ...moved, ...place, entry_id: 'entry-63', fields_changed: ['modified', 'source_slug', 'source_url'] },
        { ...deleted, ...place, entry_id: 'entry-64', detail: 'tombstone: trashed at the origin — it can still come back' },
      ],
      redirects: [{ from: '/e2e-renamed-post-038932/', to: '/e2e-renamed-new-038932/', status: 301 }],
    })
  })

  it('leaves its inputs as they were', () => {
    const delta = e2eDelta()
    const store = t0()
    const before = JSON.stringify({ delta, store })
    planSourceDelta({ delta, store, incoming: t1() })
    expect(JSON.stringify({ delta, store })).toBe(before)
  })

  it('flags a record the repository also edited instead of overwriting it', () => {
    const store = t0()
    store.files[META_62] = `${JSON.stringify({ source: 'human', status: 'published', updated_by: 'editor@example.com', updated_at: '2026-09-18T14:00:00.000Z' })}\n`
    const [updated] = planSourceDelta({ delta: e2eDelta(), store, incoming: t1() }).entries
    expect(updated).toMatchObject({
      conflict: true,
      repo_edit: { updated_by: 'editor@example.com', updated_at: '2026-09-18T14:00:00.000Z', source: 'human' },
      fields_changed: ['body', 'modified'],
    })
    expect(updated!.detail).toContain('not overwritten')
  })

  it('counts a write by anything but the importer as an edit, with or without a time', () => {
    const store = t0()
    store.files[META_62] = `${JSON.stringify({ source: 'agent', status: 'published', updated_by: 'contentrain-mcp' })}\n`
    const [updated] = planSourceDelta({ delta: e2eDelta(), store, incoming: t1() }).entries
    expect(updated!.repo_edit).toEqual({ updated_by: 'contentrain-mcp', source: 'agent' })
    expect(updated!.conflict).toBe(true)

    // An import stamp from an importer the caller names is not an edit.
    store.files[META_62] = `${JSON.stringify({ source: 'import', status: 'published', updated_by: 'my-importer' })}\n`
    const custom = planSourceDelta({ delta: e2eDelta(), store, incoming: t1(), importers: ['my-importer'] }).entries[0]
    expect(custom!.conflict).toBeUndefined()
  })

  it('says why it cannot place a record, and still proposes its redirect', () => {
    const store = t0()
    delete store.entry_source_map['63']
    delete store.files['.contentrain/content/blog/wp-post/entry-64.md']
    const plan = planSourceDelta({ delta: e2eDelta(), store, incoming: t1() })
    const [, moved, deleted] = plan.entries
    expect(moved).toMatchObject({ op: 'moved', unmapped: 'not-in-source-map' })
    expect(moved!.model).toBeUndefined()
    expect(deleted).toMatchObject({ op: 'deleted', deleted_kind: 'trashed', model: 'wp-post', entry_id: 'entry-64', unmapped: 'entry-not-found' })
    expect(plan.redirects).toEqual([{ from: '/e2e-renamed-post-038932/', to: '/e2e-renamed-new-038932/', status: 301 }])
  })

  it('without the incoming export, places records but reports no field differences', () => {
    const plan = planSourceDelta({ delta: e2eDelta(), store: t0() })
    expect(plan.entries[0]).toMatchObject({ entry_id: 'entry-62', detail: 'content changed; no incoming export to compare with' })
    expect(plan.entries[0]!.fields_changed).toBeUndefined()
    expect(plan.warnings).toEqual(['no incoming export: no field-level differences and no address for created records'])
  })

  it('addresses a created record from the export that carries it', () => {
    const delta = { ...e2eDelta(), entries: [{ op: 'created' as const, wp_id: 99, wp_type: 'post' }] }
    const incoming = t1()
    incoming.entry_source_map['99'] = { model_id: 'wp-post', entry_id: 'entry-99', locale: 'en-us' }
    expect(planSourceDelta({ delta, store: t0(), incoming }).entries[0]).toEqual({
      op: 'created', wp_id: 99, wp_type: 'post', model: 'wp-post', entry_id: 'entry-99', locale: 'en-us',
    })
    expect(planSourceDelta({ delta, store: t0(), incoming: t1() }).entries[0]!.unmapped).toBe('not-in-source-map')
  })
})

describe('planSourceDelta — the Bridge B-06 twelve-mutation delta', () => {
  const delta = b06Delta()
  const plan = planSourceDelta({ delta, store: { files: {}, entry_source_map: {} } })

  it('keeps every fact the Bridge stated', () => {
    expect(plan.entries).toHaveLength(12)
    plan.entries.forEach((entry, i) => {
      const { detail: _planned, ...facts } = delta.entries[i]!
      expect(entry).toMatchObject(facts)
    })
    expect(plan.cursor).toEqual(delta.cursor)
    expect(plan.next_cursor).toEqual(delta.next_cursor)
    expect(plan.deletions_detectable).toBe(true)
  })

  it('keeps trashed apart from purged', () => {
    const tombstones = plan.entries.filter(e => e.op === 'deleted').map(e => [e.wp_type, e.wp_id, e.deleted_kind, e.detail])
    expect(tombstones).toEqual([
      ['attachment', 93, 'purged', 'tombstone: purged from the origin'],
      ['post', 82, 'trashed', 'tombstone: trashed at the origin — it can still come back'],
      ['post', 83, 'purged', 'tombstone: purged from the origin'],
    ])
  })

  it('proposes a redirect for every address that moved — slug, parent and term base alike', () => {
    expect(plan.redirects).toEqual([
      { from: '/category/delta-cat-16e548/', to: '/category/delta-cat-renamed-16e548/', status: 301 },
      { from: '/delta-parent-a-16e548/delta-child-16e548/', to: '/delta-parent-b-16e548/delta-child-16e548/', status: 301 },
      { from: '/delta-slug-16e548/', to: '/delta-slug-renamed-16e548/', status: 301 },
    ])
  })

  it('says why each record has no place in an empty store', () => {
    const reasons = Object.fromEntries(plan.entries.map(e => [`${e.wp_type}:${e.wp_id}`, e.unmapped]))
    expect(reasons['attachment:93']).toBe('no-model-for-type')
    expect(reasons['category:6']).toBe('no-model-for-type')
    expect(Object.entries(reasons).filter(([, reason]) => reason === 'not-in-source-map')).toHaveLength(10)
  })
})

describe('planSourceDelta — terms and media', () => {
  // A term id and a post id can be equal; the source map lists posts only.
  const store: DeltaStore = {
    files: {
      '.contentrain/config.json': JSON.stringify({ locales: { default: 'en' } }),
      '.contentrain/models/wp-post.json': JSON.stringify({ id: 'wp-post', kind: 'collection', domain: 'blog', i18n: false }),
      '.contentrain/models/categories.json': JSON.stringify({ id: 'categories', kind: 'collection', domain: 'blog', i18n: false }),
      '.contentrain/models/media.json': JSON.stringify({ id: 'media', kind: 'collection', domain: 'assets', i18n: false }),
      '.contentrain/content/blog/wp-post/data.json': JSON.stringify({ p6: { title: 'Post six', wp_id: 6 } }),
      '.contentrain/content/blog/categories/data.json': JSON.stringify({ c6: { name: 'News', wp_id: 6 } }),
      '.contentrain/content/assets/media/data.json': JSON.stringify({ m93: { title: 'Cover', wp_id: 93 } }),
      '.contentrain/meta/wp-post/en.json': JSON.stringify({ p6: { source: 'import', status: 'published', updated_by: '@contentrain/wp-import' } }),
    },
    entry_source_map: { 6: { model_id: 'wp-post', entry_id: 'p6' } },
  }

  it('finds a term by its wp_id in the taxonomy model, never through the post map', () => {
    const plan = planSourceDelta({ delta: handDelta([{ op: 'deleted', wp_id: 6, wp_type: 'category', deleted_kind: 'purged' }, { op: 'deleted', wp_id: 6, wp_type: 'post', deleted_kind: 'trashed' }]), store })
    expect(plan.entries.map(e => [e.model, e.entry_id])).toEqual([['categories', 'c6'], ['wp-post', 'p6']])
  })

  it('finds media by wp_id, and reports an unknown term as not found', () => {
    const plan = planSourceDelta({ delta: handDelta([{ op: 'deleted', wp_id: 93, wp_type: 'attachment', deleted_kind: 'purged' }, { op: 'deleted', wp_id: 7, wp_type: 'category', deleted_kind: 'purged' }]), store })
    expect(plan.entries.map(e => [e.model, e.entry_id, e.unmapped])).toEqual([['media', 'm93', undefined], [undefined, undefined, 'entry-not-found']])
  })

  it('compares a collection entry field by field', () => {
    const incoming: DeltaStore = { files: { ...store.files, '.contentrain/content/blog/categories/data.json': JSON.stringify({ c6: { name: 'Updates', wp_id: 6 } }) }, entry_source_map: {} }
    const plan = planSourceDelta({ delta: handDelta([{ op: 'updated', wp_id: 6, wp_type: 'category' }]), store, incoming })
    expect(plan.entries[0]).toMatchObject({ model: 'categories', entry_id: 'c6', fields_changed: ['name'] })
  })

  it('finds a custom taxonomy by its own model, whether or not the caller names it', () => {
    const custom: DeltaStore = { ...store, files: { ...store.files, '.contentrain/models/genre.json': JSON.stringify({ id: 'genre', kind: 'collection', domain: 'blog', i18n: false }), '.contentrain/content/blog/genre/data.json': JSON.stringify({ g6: { name: 'Jazz', wp_id: 6 } }) } }
    const entries = [{ op: 'deleted' as const, wp_id: 6, wp_type: 'genre', deleted_kind: 'purged' as const }]
    expect(planSourceDelta({ delta: handDelta(entries), store: custom, taxonomies: ['genre'] }).entries[0]!.entry_id).toBe('g6')
    expect(planSourceDelta({ delta: handDelta(entries), store: custom }).entries[0]!.entry_id).toBe('g6')
  })

  it('needs the taxonomy list for a taxonomy the store has no model for', () => {
    const entries = [{ op: 'deleted' as const, wp_id: 6, wp_type: 'genre', deleted_kind: 'purged' as const }]
    expect(planSourceDelta({ delta: handDelta(entries), store, taxonomies: ['genre'] }).entries[0]!.unmapped).toBe('no-model-for-type')
    // Unnamed and without a model, `genre` reads as a post type and the post map answers with post 6 — the reason the list exists.
    expect(planSourceDelta({ delta: handDelta(entries), store }).entries[0]!.entry_id).toBe('p6')
  })
})

describe('planSourceDelta — what a plan cannot know', () => {
  it('warns when deletions could not be determined', () => {
    const plan = planSourceDelta({
      delta: { ...e2eDelta(), deletions_detectable: false, deletions_undetectable_types: ['product'] },
      store: t0(),
      incoming: t1(),
    })
    expect(plan.warnings).toEqual([
      'deletions could not be determined from this cursor; the absence of a deleted entry does not mean nothing was deleted',
      'deletions could not be determined for: product',
    ])
  })
})

describe('formatSourceDeltaReport', () => {
  it('reads as a dry run: records, conflicts, unmapped, redirects', () => {
    const store = t0()
    store.files[META_62] = `${JSON.stringify({ source: 'human', status: 'published', updated_by: 'editor@example.com' })}\n`
    delete store.entry_source_map['63']
    const report = formatSourceDeltaReport(planSourceDelta({ delta: e2eDelta(), store, incoming: t1() }))
    expect(report).toContain('Source delta: 3 records (1 updated, 1 moved, 1 deleted)')
    expect(report).toContain('updated  post 62  wp-post/entry-62  fields: body, modified  CONFLICT')
    expect(report).toContain('deleted  post 64  wp-post/entry-64  trashed')
    expect(report).toContain('Conflicts (1):\n  post 62 → wp-post/entry-62: edited by editor@example.com')
    expect(report).toContain('Unmapped (1):\n  moved post 63: not-in-source-map')
    expect(report).toContain('Redirects (1):\n  /e2e-renamed-post-038932/ → /e2e-renamed-new-038932/ (301)')
    expect(report.trimEnd().endsWith('Dry run: nothing was written. Applying a plan goes through review.')).toBe(true)
  })
})
