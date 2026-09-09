import { describe, it, expect } from 'vitest'
import { parseWxr, rawToContentrain, buildCommentsExport, summarizeComments, hexId } from './index'
import { FIXTURE } from './wxr.test'

const load = async () => {
  const { raw } = await parseWxr(FIXTURE)
  return { raw, result: rawToContentrain(raw, { updatedBy: 'test' }) }
}

describe('rawToContentrain', () => {
  it('produces a PATH_PATTERNS-conformant canonical file map', async () => {
    const { result } = await load()
    for (const path of [
      '.contentrain/config.json',
      '.contentrain/vocabulary.json',
      '.contentrain/models/posts.json',
      '.contentrain/models/pages.json',
      '.contentrain/models/categories.json',
      '.contentrain/models/media.json',
      '.contentrain/models/menus.json',
      '.contentrain/models/comments.json',
      '.contentrain/content/blog/posts/data.json',
      '.contentrain/meta/posts/en.json',
      'import-report.json',
    ]) {
      expect(result.files[path], path).toBeDefined()
    }
    for (const content of Object.values(result.files)) {
      expect(content.endsWith('\n')).toBe(true)
    }
    const config = JSON.parse(result.files['.contentrain/config.json']!)
    expect(config.locales).toEqual({ default: 'en', supported: ['en'] })
  })

  it('entry ids come from the shared identity formulas', async () => {
    const { result } = await load()
    const posts = JSON.parse(result.files['.contentrain/content/blog/posts/data.json']!)
    expect(posts[hexId('posts:hello-world')]).toMatchObject({ title: 'Hello World', slug: 'hello-world', wp_id: 10 })
  })

  it('EntrySourceMap addresses every post by WP id', async () => {
    const { result } = await load()
    expect(result.entry_source_map['10']).toEqual({ model_id: 'posts', entry_id: hexId('posts:hello-world'), locale: 'en' })
    expect(result.entry_source_map['11']).toEqual({ model_id: 'pages', entry_id: hexId('pages:about'), locale: 'en' })
  })

  it('maps WordPress statuses onto workflow states', async () => {
    const { result } = await load()
    const postMeta = JSON.parse(result.files['.contentrain/meta/posts/en.json']!)
    const pageMeta = JSON.parse(result.files['.contentrain/meta/pages/en.json']!)
    expect(postMeta[hexId('posts:hello-world')].status).toBe('published')
    expect(pageMeta[hexId('pages:about')].status).toBe('draft')
    const commentMeta = JSON.parse(result.files['.contentrain/meta/comments/en.json']!)
    const statuses = Object.values(commentMeta).map((m) => (m as { status: string }).status)
    expect(statuses.toSorted()).toEqual(['in_review', 'published'])
  })

  it('resolves cover to the media entry and unions relation fields', async () => {
    const { result } = await load()
    const posts = JSON.parse(result.files['.contentrain/content/blog/posts/data.json']!)
    expect(posts[hexId('posts:hello-world')].cover).toBe(hexId('media:77'))
    const model = JSON.parse(result.files['.contentrain/models/posts.json']!)
    expect(model.fields.categories.type).toBe('relations')
    // open meta wins over the ACF pair (original chain's precedence): subtitle lands as a plain string field
    expect(model.fields.subtitle.type).toBe('string')
  })

  it('referenced-but-unlisted terms join the pool instead of vanishing', async () => {
    const { result } = await load()
    const cats = JSON.parse(result.files['.contentrain/content/blog/categories/data.json']!)
    expect(cats[hexId('category:ghost')]).toMatchObject({ slug: 'ghost' })
  })

  it('menus land as linked collections with vocabulary from labels', async () => {
    const { result } = await load()
    const menus = JSON.parse(result.files['.contentrain/content/site/menus/data.json']!)
    const menu = Object.values(menus)[0] as { items: string[] }
    expect(menu.items).toHaveLength(2)
    const vocab = JSON.parse(result.files['.contentrain/vocabulary.json']!)
    expect(vocab.terms.home).toEqual({ en: 'Home' })
  })

  it('is deterministic', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const a = rawToContentrain(raw, { updatedBy: 'test' })
    const b = rawToContentrain(raw, { updatedBy: 'test' })
    expect(a.files).toEqual(b.files)
  })

  it('preserves ACF field → field-group and nested field parents with polymorphic references', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const base = raw.posts[0]!
    raw.posts.push(
      { ...base, id: 100, type: 'acf-field-group', slug: 'group-example', parent: 0 },
      { ...base, id: 101, type: 'acf-field', slug: 'field-section', parent: 100 },
      { ...base, id: 102, type: 'acf-field', slug: 'field-title', parent: 101 },
    )
    const result = rawToContentrain(raw)
    const model = JSON.parse(result.files['.contentrain/models/acf-field.json']!)
    const entries = JSON.parse(result.files['.contentrain/content/custom/acf-field/data.json']!)
    expect(model.fields.parent.model).toEqual(['acf-field', 'acf-field-group'])
    expect(entries[result.entry_source_map['101']!.entry_id].parent).toEqual({
      model: 'acf-field-group', ref: result.entry_source_map['100']!.entry_id,
    })
    expect(entries[result.entry_source_map['102']!.entry_id].parent).toEqual({
      model: 'acf-field', ref: result.entry_source_map['101']!.entry_id,
    })
    expect(result.report.dropped_relations).toBe(0)
    const reversed = rawToContentrain({ ...raw, posts: raw.posts.toReversed() })
    expect(reversed.files['.contentrain/models/acf-field.json']).toBe(result.files['.contentrain/models/acf-field.json'])
    expect(reversed.files['.contentrain/content/custom/acf-field/data.json']).toBe(result.files['.contentrain/content/custom/acf-field/data.json'])
  })

  it.each(['page', 'acf-field-group'])('keeps a single %s parent target as an ID string', async (parentType) => {
    const { raw } = await parseWxr(FIXTURE)
    raw.posts.push(
      { ...raw.posts[1]!, id: 100, type: parentType, slug: 'parent', parent: 0 },
      { ...raw.posts[1]!, id: 101, slug: 'child', parent: 100 },
    )
    const result = rawToContentrain(raw)
    const model = JSON.parse(result.files['.contentrain/models/pages.json']!)
    const entries = JSON.parse(result.files['.contentrain/content/site/pages/data.json']!)
    expect(model.fields.parent.model).toBe(parentType === 'page' ? 'pages' : parentType)
    expect(entries[result.entry_source_map['101']!.entry_id].parent).toBe(result.entry_source_map['100']!.entry_id)
    expect(result.report.dropped_relations).toBe(0)
  })

  it('reports missing and excluded parents without emitting dangling source-map addresses', async () => {
    const { raw } = await parseWxr(FIXTURE)
    raw.posts.push(
      { ...raw.posts[1]!, id: 100, type: 'revision', slug: 'ignored', parent: 0 },
      { ...raw.posts[1]!, id: 101, slug: 'child', parent: 100 },
      { ...raw.posts[1]!, id: 102, slug: 'orphan', parent: 999 },
    )
    const result = rawToContentrain(raw)
    const entries = JSON.parse(result.files['.contentrain/content/site/pages/data.json']!)
    expect(result.entry_source_map['100']).toBeUndefined()
    expect(result.report.skipped_types).toContain('revision')
    expect(result.report.dropped_relations).toBe(2)
    for (const id of ['101', '102']) expect(entries[result.entry_source_map[id]!.entry_id].parent).toBeUndefined()
  })
})

describe('comments export', () => {
  it('builds the intake payload with entry addresses and closed threads', async () => {
    const { raw, result } = await load()
    raw.posts.find((p) => p.id === 11)!.comment_status = 'closed'
    const exp = buildCommentsExport(raw, result.entry_source_map, { generated_at: '2026-08-24T20:00:00Z' })
    expect(exp.format).toBe('contentrain-comments@1')
    expect(exp.entries['10']!.model_id).toBe('posts')
    expect(exp.threads_closed).toEqual([11])
    expect(exp.comments).toHaveLength(2)
    const summary = summarizeComments(exp)
    expect(summary.total).toBe(2)
    expect(summary.by_status).toEqual({ '1': 1, '0': 1 })
    expect(summary.unresolved).toBeUndefined()
  })

  it('a multilingual site becomes an i18n store: content per locale, one entry id per translation group', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const hello = raw.posts.find((p) => p.id === 10)!
    const merhaba = { ...hello, id: 20, slug: 'merhaba-dunya', title: 'Merhaba Dünya', content: '<p>İlk yazı</p>', lang: 'tr', terms: hello.terms.filter((t) => t.taxonomy !== 'post_tag') }
    const lonely = { ...hello, id: 21, slug: 'sadece-turkce', title: 'Sadece Türkçe', lang: 'tr_TR', terms: [] }
    const multilingual = {
      ...raw,
      posts: [...raw.posts.map((p) => (p.id === 10 ? { ...p, lang: 'en' } : p)), merhaba, lonely],
      terms: [...raw.terms, { id: 900, taxonomy: 'language', slug: 'tr', name: 'Türkçe', parent: null, parent_resolved: true, description: '' }],
      language_pairs: [{ post: 10, translations: { en: 10, tr: 20 } }],
    }
    const result = rawToContentrain(multilingual, { updatedBy: 'test' })

    const posts = JSON.parse(result.files['.contentrain/models/posts.json']!)
    expect(posts.i18n).toBe(true)
    expect(JSON.parse(result.files['.contentrain/models/pages.json']!).i18n).toBe(true)
    // language bookkeeping is not a taxonomy model
    expect(result.files['.contentrain/models/language.json']).toBeUndefined()
    expect(result.files['.contentrain/content/blog/posts/data.json']).toBeUndefined()

    const en = JSON.parse(result.files['.contentrain/content/blog/posts/en.json']!)
    const tr = JSON.parse(result.files['.contentrain/content/blog/posts/tr.json']!)
    const shared = hexId('posts:hello-world')
    expect(en[shared]).toMatchObject({ title: 'Hello World', slug: 'hello-world', wp_id: 10 })
    expect(tr[shared]).toMatchObject({ title: 'Merhaba Dünya', slug: 'merhaba-dunya', wp_id: 20 })
    expect(tr[hexId('posts:sadece-turkce')]).toMatchObject({ wp_id: 21 })
    expect(en[hexId('posts:sadece-turkce')]).toBeUndefined()

    expect(JSON.parse(result.files['.contentrain/meta/posts/tr.json']!)[shared].status).toBe('published')
    expect(JSON.parse(result.files['.contentrain/config.json']!).locales).toEqual({ default: 'en', supported: ['en', 'tr'] })

    expect(result.entry_source_map['10']).toEqual({ model_id: 'posts', entry_id: shared, locale: 'en' })
    expect(result.entry_source_map['20']).toEqual({ model_id: 'posts', entry_id: shared, locale: 'tr' })
    expect(result.entry_source_map['21']).toEqual({ model_id: 'posts', entry_id: hexId('posts:sadece-turkce'), locale: 'tr' })
    expect(result.report.locales).toEqual(['en', 'tr'])
    expect(result.report.translation_groups).toBe(1)
    expect(result.report.models.posts!.entries).toBe(2)
  })

  it('a monolingual site is unchanged: i18n false, data.json, one supported locale', async () => {
    const { result } = await load()
    expect(JSON.parse(result.files['.contentrain/models/posts.json']!).i18n).toBe(false)
    expect(result.files['.contentrain/content/blog/posts/data.json']).toBeDefined()
    expect(result.report.locales).toEqual(['en'])
    expect(result.report.translation_groups).toBe(0)
  })
})
