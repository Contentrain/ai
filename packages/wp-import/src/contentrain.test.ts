import { describe, it, expect } from 'vitest'
import type { FieldDef, RawIR } from '@contentrain/types'
import { validateFieldValue } from '@contentrain/types'
import { parseWxr, rawToContentrain, buildCommentsExport, summarizeComments, hexId } from './index'
import { FIXTURE } from './wxr.test'

const load = async () => {
  const { raw } = await parseWxr(FIXTURE)
  return { raw, result: rawToContentrain(raw, { updatedBy: 'test' }) }
}

const protectedItem = (id: number, slug: string, status: string) => `<item>
  <title>${slug}</title>
  <wp:post_id>${id}</wp:post_id>
  <wp:post_date_gmt>2027-01-01 09:00:00</wp:post_date_gmt>
  <wp:post_name>${slug}</wp:post_name>
  <wp:status>${status}</wp:status>
  <wp:post_type>post</wp:post_type>
  <wp:post_password>hunter2</wp:post_password>
  <content:encoded><![CDATA[<p>members only</p>]]></content:encoded>
</item>`
const protectedMeta = (files: Record<string, string>, slug: string) => JSON.parse(files['.contentrain/meta/posts/en.json']!)[hexId(`posts:${slug}`)]
const postEntries = (files: Record<string, string>) => JSON.parse(files['.contentrain/content/blog/posts/data.json']!)

describe('password-protected posts never come in published, on any path', () => {
  it('WXR: published and scheduled protected posts become drafts, and the password is never read into RawIR', async () => {
    const xml = FIXTURE.replace('</channel>', `${protectedItem(30, 'locked', 'publish')}${protectedItem(31, 'locked-later', 'future')}${protectedItem(32, 'locked-bin', 'trash')}</channel>`)
    const { raw } = await parseWxr(xml)
    expect(raw.posts.filter((p) => p.password).map((p) => [p.slug, p.password])).toEqual([
      ['locked', '[protected]'], ['locked-later', '[protected]'], ['locked-bin', '[protected]'],
    ])
    expect(JSON.stringify(raw)).not.toContain('hunter2')
    const { files, report } = rawToContentrain(raw, { updatedBy: 'test' })
    expect(protectedMeta(files, 'locked')).toMatchObject({ status: 'draft' })
    expect(protectedMeta(files, 'locked-later')).toMatchObject({ status: 'draft' })
    expect(protectedMeta(files, 'locked-later').publish_at).toBeUndefined()
    expect(protectedMeta(files, 'locked-bin')).toMatchObject({ status: 'archived' })
    expect(report.password_protected_drafts).toBe(2)
    expect(JSON.parse(files['import-report.json']!).password_protected_drafts).toBe(2)
    expect(postEntries(files)[hexId('posts:locked')].visibility).toBe('password')
    // Unprotected posts are untouched.
    expect(protectedMeta(files, 'hello-world')).toMatchObject({ status: 'published' })
  })

  it('Bridge: a RawIR that carries the plaintext password still yields a draft, and the password reaches no file', async () => {
    const { raw: base } = await parseWxr(FIXTURE)
    const hello = base.posts.find((p) => p.slug === 'hello-world')!
    const raw: RawIR = {
      ...base,
      provenance: { kind: 'bridge', tool: 'contentrain-bridge' },
      posts: [...base.posts, { ...hello, id: 40, slug: 'bridged-locked', password: 'hunter2', status: 'publish' }],
    }
    const { files, report } = rawToContentrain(raw, { updatedBy: 'test' })
    expect(protectedMeta(files, 'bridged-locked')).toMatchObject({ status: 'draft' })
    expect(postEntries(files)[hexId('posts:bridged-locked')].visibility).toBe('password')
    expect(report.password_protected_drafts).toBe(1)
    expect(Object.values(files).join('\n')).not.toContain('hunter2')
  })
})

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

/**
 * Every value the importer writes must pass the type check of the model it
 * writes beside it. The importer and the validator are two readings of one
 * schema, and when they disagree the store fails its own gate on every entry
 * that carries the field — which is what happened with media `parent`: written
 * as `{ model, ref }` for a polymorphic relation, rejected as "not a string".
 */
function storeViolations(files: Record<string, string>): { checked: Record<string, number>, violations: string[] } {
  const checked: Record<string, number> = {}
  const violations: string[] = []
  for (const [path, text] of Object.entries(files)) {
    if (!/^\.contentrain\/models\/.+\.json$/.test(path)) continue
    const def = JSON.parse(text) as { id: string, kind: string, domain: string, fields?: Record<string, FieldDef> }
    if (def.kind !== 'collection' || !def.fields) continue
    const data = files[`.contentrain/content/${def.domain}/${def.id}/data.json`]
    if (data === undefined) continue
    for (const [entryId, entry] of Object.entries(JSON.parse(data) as Record<string, Record<string, unknown>>)) {
      for (const [field, value] of Object.entries(entry)) {
        const fieldDef = def.fields[field]
        if (!fieldDef) continue
        checked[`${def.id}.${field}`] = (checked[`${def.id}.${field}`] ?? 0) + 1
        for (const issue of validateFieldValue(value, fieldDef)) {
          if (issue.severity === 'error') violations.push(`${def.id}/${entryId}.${field}: ${issue.message} (${JSON.stringify(value)})`)
        }
      }
    }
  }
  return { checked, violations }
}

const MEDIA = '.contentrain/content/assets/media/data.json'
const targetModel = (files: Record<string, string>) => JSON.parse(files['.contentrain/models/menu-items.json']!).fields.target.model
const attachedMedia = (files: Record<string, string>) =>
  Object.values(JSON.parse(files[MEDIA]!) as Record<string, { parent?: unknown }>).filter((m) => m.parent !== undefined)

describe('what the importer writes passes its own models', () => {
  it('the fixture store has no field that fails its model', async () => {
    const { result } = await load()
    // The case that failed: an attachment attached to a post, on a site with
    // posts and pages — a polymorphic parent stored as { model, ref }.
    expect(JSON.parse(result.files['.contentrain/models/media.json']!).fields.parent.model).toEqual(['posts', 'pages'])
    expect(attachedMedia(result.files).map((m) => typeof m.parent)).toContain('object')
    const { checked, violations } = storeViolations(result.files)
    expect(checked['media.parent']).toBeGreaterThan(0)
    expect(checked['posts.title']).toBeGreaterThan(0)
    expect(violations).toEqual([])
  })

  it('with a single content type, media parent is a single-target relation holding the id', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const result = rawToContentrain({ ...raw, posts: raw.posts.filter((p) => p.type === 'post') })
    expect(JSON.parse(result.files['.contentrain/models/media.json']!).fields.parent.model).toBe('posts')
    const attached = attachedMedia(result.files)
    expect(attached.length).toBeGreaterThan(0)
    for (const m of attached) expect(typeof m.parent).toBe('string')
    const { checked, violations } = storeViolations(result.files)
    expect(checked['media.parent']).toBeGreaterThan(0)
    // Comments point at content too, and failed the same way.
    expect(JSON.parse(result.files['.contentrain/models/comments.json']!).fields.post.model).toBe('posts')
    expect(checked['comments.post']).toBeGreaterThan(0)
    expect(violations).toEqual([])
  })

  it('a menu target over one model holds the id; over several, the pair', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const several = rawToContentrain(raw)
    const one = rawToContentrain({ ...raw, posts: raw.posts.filter((p) => p.type === 'post'), terms: raw.terms.filter((t) => t.taxonomy === 'nav_menu') })
    expect(Array.isArray(targetModel(several.files))).toBe(true)
    expect(targetModel(one.files)).toBe('posts')
    for (const result of [several, one]) {
      const { checked, violations } = storeViolations(result.files)
      expect(checked['menu-items.target']).toBeGreaterThan(0)
      expect(violations).toEqual([])
    }
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
    expect(exp.excluded).toBeUndefined()
  })

  it('carries public, approved or pending comments only; counts what it leaves out', async () => {
    const { raw, result } = await load()
    const base = raw.comments![0]!
    const post = (id: number, over: object) => ({ ...raw.posts.find((p) => p.id === 10)!, id, slug: `p${id}`, ...over })
    const withMore = {
      ...raw,
      posts: [...raw.posts, post(30, { status: 'draft' }), post(31, { status: 'private' }), post(32, { password: '[protected]' }), post(33, { status: 'future' })],
      comments: [
        ...raw.comments!,
        { ...base, id: 900, post: 30, content: 'on a draft' },
        { ...base, id: 901, post: 31, content: 'on a private post' },
        { ...base, id: 902, post: 32, content: 'behind a password' },
        { ...base, id: 903, post: 33, content: 'on a scheduled post' },
        { ...base, id: 904, post: 10, approved: 'spam', content: 'buy now' },
        { ...base, id: 905, post: 10, approved: 'trash', content: 'deleted' },
        { ...base, id: 906, post: 10, approved: '0', content: 'waiting for moderation' },
        { ...base, id: 907, post: 10, approved: 'post-trashed', content: 'on a trashed post' },
        { ...base, id: 908, post: 10, approved: 'akismet-held', content: 'a plugin status' },
        { ...base, id: 909, post: 999, content: 'on a post the export does not hold' },
        { ...base, id: 910, post: 10, approved: undefined, content: 'no status means approved' },
      ],
    }
    const exp = buildCommentsExport(withMore, result.entry_source_map, { generated_at: '2026-09-25T00:00:00Z' })
    const ids = exp.comments.map((c) => c.id)
    expect(ids.filter((id) => id >= 900)).toEqual([906, 910])
    expect(exp.excluded).toEqual({ non_public_entry: 4, unknown_entry: 1, spam: 1, trash: 1, other_status: 2 })
    expect(summarizeComments(exp).excluded).toEqual(exp.excluded)
    expect(JSON.stringify(exp)).not.toMatch(/on a draft|private post|behind a password|scheduled post|buy now|deleted|trashed post|plugin status|does not hold/)
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

  it('a partially-translated site declares each model\'s real locale coverage', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const hello = raw.posts.find((p) => p.id === 10)!
    // Posts exist in all three site languages; pages only in the default one,
    // and a CPT only in en + da. That is the shape `model.locales` exists for:
    // without it, every untranslated page is a hard parity error downstream.
    const posts = [
      { ...hello, id: 10, lang: 'en' },
      { ...hello, id: 20, slug: 'merhaba', title: 'Merhaba', lang: 'tr', terms: [] },
      { ...hello, id: 30, slug: 'hej', title: 'Hej', lang: 'da', terms: [] },
      { ...raw.posts.find((p) => p.id === 11)!, lang: 'en' },
      { ...hello, id: 40, type: 'product', slug: 'widget', title: 'Widget', lang: 'en', terms: [] },
      { ...hello, id: 41, type: 'product', slug: 'widget-da', title: 'Widget DA', lang: 'da', terms: [] },
    ]
    const result = rawToContentrain({ ...raw, posts, comments: [], language_pairs: [
      { post: 10, translations: { en: 10, tr: 20, da: 30 } },
      { post: 40, translations: { en: 40, da: 41 } },
    ] }, { updatedBy: 'test' })

    const config = JSON.parse(result.files['.contentrain/config.json']!)
    expect(config.locales).toEqual({ default: 'en', supported: ['en', 'da', 'tr'] })

    // Fully translated → no `locales` key at all; absent already means "all".
    const postsModel = JSON.parse(result.files['.contentrain/models/posts.json']!)
    expect(postsModel.i18n).toBe(true)
    expect('locales' in postsModel).toBe(false)

    // Untranslated → the default locale alone, and it is still an i18n model.
    const pagesModel = JSON.parse(result.files['.contentrain/models/pages.json']!)
    expect(pagesModel.i18n).toBe(true)
    expect(pagesModel.locales).toEqual(['en'])

    // Partially translated → exactly the locales with content, in config order.
    const productModel = JSON.parse(result.files['.contentrain/models/product.json']!)
    expect(productModel.locales).toEqual(['en', 'da'])
    expect(result.files['.contentrain/content/custom/product/en.json']).toBeDefined()
    expect(result.files['.contentrain/content/custom/product/da.json']).toBeDefined()
    expect(result.files['.contentrain/content/custom/product/tr.json']).toBeUndefined()

    // Non-i18n models are untouched: they have one locale-agnostic copy.
    expect('locales' in JSON.parse(result.files['.contentrain/models/media.json']!)).toBe(false)
  })

  it('a monolingual site writes no locales field — every model already covers the one locale', async () => {
    const { result } = await load()
    for (const id of ['posts', 'pages', 'media', 'categories']) {
      expect('locales' in JSON.parse(result.files[`.contentrain/models/${id}.json`]!), id).toBe(false)
    }
  })

  it('preserves separate translation groups with the same canonical slug, including their shared locale', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const base = raw.posts[0]!
    const posts = [
      { ...base, id: 101, lang: 'en', slug: 'shared' },
      { ...base, id: 102, lang: 'tr', slug: 'bir' },
      { ...base, id: 201, lang: 'fr', slug: 'shared' },
      { ...base, id: 202, lang: 'tr', slug: 'iki' },
    ]
    const input: RawIR = { ...raw, posts, comments: [], language_pairs: [
      { post: 101, translations: { en: 101, tr: 102 } },
      { post: 201, translations: { fr: 201, tr: 202 } },
    ] }
    const result = rawToContentrain(input)
    const tr = JSON.parse(result.files['.contentrain/content/blog/posts/tr.json']!)
    const first = result.entry_source_map['102']!.entry_id
    const second = result.entry_source_map['202']!.entry_id
    expect(first).not.toBe(second)
    expect(first).toBe(hexId('posts:shared'))
    expect(tr[first].wp_id).toBe(102)
    expect(tr[second].wp_id).toBe(202)
    expect(Object.keys(tr)).toHaveLength(2)
    expect(result.entry_source_map['201']!.entry_id).toBe(second)
    expect(rawToContentrain({ ...input, posts: posts.toReversed() }).files).toEqual(result.files)
  })

  it('refuses translation groups that collapse regional variants into one locale instead of losing content', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const base = raw.posts[0]!
    expect(() => rawToContentrain({ ...raw, posts: [
      { ...base, id: 101, lang: 'en-US' },
      { ...base, id: 102, lang: 'en-GB' },
    ], language_pairs: [{ post: 101, translations: { 'en-US': 101, 'en-GB': 102 } }] }))
      .toThrow('same normalized locale')
  })

  it('preserves WordPress scheduled publication intent without publishing undated future posts', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const post = { ...raw.posts[0]!, status: 'future', date: '2027-01-01T12:00:00Z' }
    const result = rawToContentrain({ ...raw, posts: [post] })
    const meta = JSON.parse(result.files['.contentrain/meta/posts/en.json']!)
    expect(meta[result.entry_source_map[String(post.id)]!.entry_id]).toMatchObject({ status: 'published', publish_at: post.date })
    expect(() => rawToContentrain({ ...raw, posts: [{ ...post, date: null }] })).toThrow('no valid publication date')
  })

  it('a monolingual site is unchanged: i18n false, data.json, one supported locale', async () => {
    const { result } = await load()
    expect(JSON.parse(result.files['.contentrain/models/posts.json']!).i18n).toBe(false)
    expect(result.files['.contentrain/content/blog/posts/data.json']).toBeDefined()
    expect(result.report.locales).toEqual(['en'])
    expect(result.report.translation_groups).toBe(0)
  })
})
