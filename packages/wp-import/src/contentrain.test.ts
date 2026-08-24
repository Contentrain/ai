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
})
