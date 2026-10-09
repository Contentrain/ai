import { describe, it, expect } from 'vitest'
import type { FieldDef, RawIR } from '@contentrain/types'
import { validateFieldValue } from '@contentrain/types'
import { parseWxr, rawToContentrain, buildCommentsExport, summarizeComments, hexId } from './index'
import { FIXTURE } from './wxr.test'
import { stripBlockDelimiters } from './blocks'

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

const landing = (id: number, slug: string) => `<item>
<title>Summer sale</title>
<link>https://fixture.example/${slug}/</link>
<wp:post_id>${id}</wp:post_id>
<wp:post_date_gmt>2026-06-01 10:00:00</wp:post_date_gmt>
<wp:post_name>${slug}</wp:post_name>
<wp:status>publish</wp:status>
<wp:post_type>e-landing-page</wp:post_type>
<content:encoded><![CDATA[<p>Everything must go</p>]]></content:encoded>
<wp:postmeta><wp:meta_key>subtitle</wp:meta_key><wp:meta_value><![CDATA[Up to 50% off]]></wp:meta_value></wp:postmeta>
</item>`
const pageEntries = (files: Record<string, string>) => JSON.parse(files['.contentrain/content/site/pages/data.json']!)

// A RawIR that did not come through parseWxr / fetchRestRawIR (a Bridge export) still carries the WordPress type.
const bridgeShaped = (mapped: RawIR): RawIR => {
  const raw = structuredClone(mapped)
  for (const p of raw.posts) if (p.id === 40) p.type = 'e-landing-page'
  raw.comments = [...(raw.comments ?? []), { ...raw.comments![0]!, id: 900, post: 40, post_type: 'e-landing-page' }]
  return raw
}

describe('Elementor landing pages are pages', () => {
  it('goes to the pages model with its slug, permalink and meta, and is not reported skipped', async () => {
    const { raw } = await parseWxr(FIXTURE.replace('</channel>', `${landing(40, 'summer-sale')}</channel>`))
    expect(raw.posts.find((p) => p.id === 40)).toMatchObject({ type: 'page', slug: 'summer-sale', link: 'https://fixture.example/summer-sale/' })
    const { files, report } = rawToContentrain(raw, { updatedBy: 'test' })
    expect(report.skipped_types).not.toContain('e-landing-page')
    expect(files['.contentrain/models/e-landing-page.json']).toBeUndefined()
    const entry = pageEntries(files)[hexId('pages:summer-sale')]
    expect(entry).toMatchObject({ slug: 'summer-sale', title: 'Summer sale', link: 'https://fixture.example/summer-sale/', subtitle: 'Up to 50% off' })
    expect(JSON.parse(files['.contentrain/meta/pages/en.json']!)[hexId('pages:summer-sale')]).toMatchObject({ status: 'published' })
    // The page that was already there is untouched.
    expect(pageEntries(files)[hexId('pages:about')]).toBeDefined()
  })

  it('shares the pages address space: a landing page and a page with one slug keep both, the later one moved', async () => {
    const { raw } = await parseWxr(FIXTURE.replace('</channel>', `${landing(41, 'about')}</channel>`))
    const { files, report } = rawToContentrain(raw, { updatedBy: 'test' })
    expect(Object.values(pageEntries(files)).filter((e: any) => String(e.slug).startsWith('about'))).toHaveLength(2)
    expect(report.slug_moves.map((m) => [m.wp_id, m.type])).toContainEqual([41, 'page'])
  })

  it('rawToContentrain maps e-landing-page itself: a Bridge-shaped RawIR lands in pages, same files as the reader path', async () => {
    const { raw: mapped } = await parseWxr(FIXTURE.replace('</channel>', `${landing(40, 'summer-sale')}</channel>`))
    const bridge = bridgeShaped(mapped)
    expect(bridge.posts.find((p) => p.id === 40)!.type).toBe('e-landing-page')
    const fromBridge = rawToContentrain(bridge, { updatedBy: 'test' })
    expect(fromBridge.files['.contentrain/models/e-landing-page.json']).toBeUndefined()
    expect(Object.keys(fromBridge.files).filter((f) => f.includes('e-landing-page'))).toEqual([])
    expect(fromBridge.report.skipped_types).not.toContain('e-landing-page')
    expect(pageEntries(fromBridge.files)[hexId('pages:summer-sale')]).toMatchObject({ slug: 'summer-sale', title: 'Summer sale' })
    expect(fromBridge.entry_source_map['40']).toEqual({ model_id: 'pages', entry_id: hexId('pages:summer-sale'), locale: 'en' })
    // The input is not mutated.
    expect(bridge.posts.find((p) => p.id === 40)!.type).toBe('e-landing-page')
    // Same store as the reader-mapped RawIR carrying the same comment.
    const readerMapped = structuredClone(mapped)
    readerMapped.comments = [...(readerMapped.comments ?? []), { ...readerMapped.comments![0]!, id: 900, post: 40, post_type: 'page' }]
    expect(fromBridge.files).toEqual(rawToContentrain(readerMapped, { updatedBy: 'test' }).files)
  })

  it('is idempotent: an already-mapped RawIR converts unchanged and is not touched', async () => {
    const { raw } = await parseWxr(FIXTURE.replace('</channel>', `${landing(40, 'summer-sale')}</channel>`))
    const before = structuredClone(raw)
    const once = rawToContentrain(raw, { updatedBy: 'test' })
    expect(raw).toEqual(before)
    expect(rawToContentrain(before, { updatedBy: 'test' }).files).toEqual(once.files)
    expect(pageEntries(once.files)[hexId('pages:summer-sale')]).toBeDefined()
  })
})

const authorsOf = (files: Record<string, string>) => Object.values(JSON.parse(files['.contentrain/content/blog/authors/data.json']!)) as Array<Record<string, unknown>>
const commentsOf = (files: Record<string, string>) => Object.values(JSON.parse(files['.contentrain/content/blog/comments/data.json']!)) as Array<Record<string, unknown>>

describe('personal data: e-mail addresses stay out of the store unless asked for', () => {
  it('WXR carries author and commenter e-mails, but the default store holds none', async () => {
    const { raw, result } = await load()
    expect(raw.authors.some((a) => a.email === 'ada@example.com')).toBe(true)
    expect(raw.comments!.some((c) => c.email === 'r@example.com')).toBe(true)
    const all = Object.values(result.files).join('\n')
    expect(all).not.toContain('ada@example.com')
    expect(all).not.toContain('r@example.com')
    expect(authorsOf(result.files).every((a) => !('email' in a))).toBe(true)
    expect(commentsOf(result.files).every((c) => !('email' in c))).toBe(true)
    // The schema keeps the field, so an opted-in import and a default one share models.
    expect(JSON.parse(result.files['.contentrain/models/authors.json']!).fields.email.type).toBe('email')
  })

  it('the comments export drops commenter e-mails (and meta holding one) unless includeEmails', async () => {
    const { raw, result } = await load()
    const withMeta = structuredClone(raw)
    for (const c of withMeta.comments!) c.meta = { akismet_as_submitted: { comment_author_email: c.email }, rating: 5 }
    const exp = buildCommentsExport(withMeta, result.entry_source_map, { generated_at: '2026-10-09T00:00:00Z' })
    expect(JSON.stringify(exp)).not.toContain('r@example.com')
    expect(exp.comments.length).toBeGreaterThan(0)
    expect(exp.comments.every((c) => c.email === null && c.meta?.rating === 5)).toBe(true)
    // The commenter with an address loses the meta that repeats it; non-personal meta stays.
    const reader = exp.comments.find((c) => c.author === 'Reader')!
    expect(reader.meta).toEqual({ rating: 5 })
    const opted = buildCommentsExport(withMeta, result.entry_source_map, { generated_at: '2026-10-09T00:00:00Z', includeEmails: true })
    expect(opted.comments.find((c) => c.author === 'Reader')!.email).toBe('r@example.com')
  })

  it('IP, user agent and avatar meta never leave, by key, even with no e-mail and with includeEmails', async () => {
    const { raw, result } = await load()
    const withPii = structuredClone(raw)
    for (const c of withPii.comments!) {
      c.email = null
      c.meta = {
        akismet_as_submitted: { user_ip: '203.0.113.7', user_agent: 'Mozilla/5.0 (X11; Linux x86_64)' },
        akismet_history: [{ event: 'check-ham' }],
        _wp_user_ip: '2001:db8::1',
        author_avatar_urls: { 96: 'https://secure.gravatar.com/avatar/abc' },
        rating: 5,
      }
    }
    for (const includeEmails of [false, true]) {
      const exp = buildCommentsExport(withPii, result.entry_source_map, { generated_at: '2026-10-09T00:00:00Z', includeEmails })
      const text = JSON.stringify(exp)
      for (const needle of ['203.0.113.7', '2001:db8::1', 'Mozilla/', 'gravatar', 'akismet']) expect(text, needle).not.toContain(needle)
      expect(exp.comments.every((c) => c.meta?.rating === 5)).toBe(true)
    }
  })

  it('includeEmails: true writes them', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const { files } = rawToContentrain(raw, { updatedBy: 'test', includeEmails: true })
    expect(authorsOf(files).map((a) => a.email)).toContain('ada@example.com')
    expect(commentsOf(files).map((c) => c.email)).toContain('r@example.com')
  })
})

describe('primary category (Yoast / Rank Math) for a %category% permalink', () => {
  const withMeta = async (meta: Record<string, unknown>) => {
    const { raw } = await parseWxr(FIXTURE)
    const post = raw.posts.find((p) => p.id === 10)!
    Object.assign(post.meta, meta)
    // The post is in both categories, so the primary decides which one its address names.
    post.terms.push({ taxonomy: 'category', slug: 'events', name: 'Events', resolved: true })
    return rawToContentrain(raw, { updatedBy: 'test' })
  }
  const postOf = (files: Record<string, string>) => postEntries(files)[hexId('posts:hello-world')]

  it("Yoast's _yoast_wpseo_primary_category becomes primary_category, a relation to categories", async () => {
    const { files } = await withMeta({ _yoast_wpseo_primary_category: '3' })
    expect(JSON.parse(files['.contentrain/models/posts.json']!).fields.primary_category).toMatchObject({ type: 'relation', model: 'categories' })
    expect(postOf(files).primary_category).toBe(hexId('category:events'))
    expect(postOf(files).categories).toContain(hexId('category:events'))
  })

  it("Rank Math's rank_math_primary_category works the same; it is not copied as a custom field", async () => {
    const { files } = await withMeta({ rank_math_primary_category: 2 })
    expect(postOf(files).primary_category).toBe(hexId('category:news'))
    expect(postOf(files).rank_math_primary_category).toBeUndefined()
  })

  it('a primary the post is not in is left out, so the address falls back to the lowest term ID', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const post = raw.posts.find((p) => p.id === 10)!
    post.meta._yoast_wpseo_primary_category = '3' // events, but the post is only in news
    const { files } = rawToContentrain(raw, { updatedBy: 'test' })
    expect(postOf(files).categories).not.toContain(hexId('category:events'))
    expect(postOf(files).primary_category).toBeUndefined()
  })

  it('no primary set: no field; a primary that names no imported category is dropped and counted', async () => {
    const none = await withMeta({})
    expect(JSON.parse(none.files['.contentrain/models/posts.json']!).fields.primary_category).toBeUndefined()
    const ghost = await withMeta({ _yoast_wpseo_primary_category: '999' })
    expect(postOf(ghost.files).primary_category).toBeUndefined()
    expect(ghost.report.dropped_relations).toBe(none.report.dropped_relations + 1)
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

  it('an archive menu item keeps its address (it has no entry to target), so the site can serve it', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const [menu] = raw.menus ?? []
    const base = menu!.items[0]!
    const archive = { ...base, id: 9001, title: 'Projects', url: 'https://s.example/projects/', target: { kind: 'archive' as const, post_type: 'project', resolved: true as const } }
    const result = rawToContentrain({ ...raw, menus: [{ ...menu!, items: [...menu!.items, archive] }] }, { updatedBy: 'test' })
    const items = JSON.parse(result.files['.contentrain/content/site/menu-items/data.json']!) as Record<string, { title: string, type: string, url?: string, target?: unknown }>
    expect(Object.values(items).find(item => item.title === 'Projects')).toMatchObject({ type: 'post_type_archive', url: 'https://s.example/projects/' })
    expect(Object.values(items).find(item => item.title === 'Projects')).not.toHaveProperty('target')
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

describe('site title', () => {
  it('is the source\'s own; with none, the entry has no title and the report says so — never a stand-in name', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const named = rawToContentrain(raw)
    expect(named.report.site_title_missing).toBe(false)
    const { files, report } = rawToContentrain({ ...raw, site: { ...raw.site, title: '' } })
    const site = JSON.parse(files['.contentrain/content/site/site/data.json']!)
    expect(site.title).toBeUndefined()
    expect(report.site_title_missing).toBe(true)
    expect(JSON.parse(files['import-report.json']!).site_title_missing).toBe(true)
    // The field stays required: the store names what is missing.
    expect(JSON.parse(files['.contentrain/models/site.json']!).fields.title.required).toBe(true)
  })
})

describe('ACF Options Pages (bridge rung)', () => {
  it('land in the site entry, typed like a post\'s ACF; a clashing name takes its page\'s slug', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const post = raw.posts.find((p) => p.type === 'post')!
    const { files, report } = rawToContentrain({
      ...raw,
      acf_options: [
        { slug: 'site-settings', title: 'Site settings', post_id: 'options', fields: {
          phone: { value: '+90 212 000 00 00', field_key: 'field_p', type: 'text' },
          title: { value: 'Options title', field_key: 'field_t', type: 'text' },
          featured: { value: post.id, field_key: 'field_f', type: 'post_object' },
          email: { value: 'x', field_key: 'field_e', type: 'password' },
        } },
        { slug: 'footer', title: 'Footer', post_id: 'options', fields: {
          phone: { value: '+90 212 111 11 11', field_key: 'field_p2', type: 'text' },
          show_social: { value: true, field_key: 'field_s', type: 'true_false' },
        } },
      ],
    })
    const site = JSON.parse(files['.contentrain/content/site/site/data.json']!)
    const fields = JSON.parse(files['.contentrain/models/site.json']!).fields
    // A core field is never overwritten; a name on two pages keeps both.
    expect(site.title).toBe(raw.site.title)
    expect(site.site_settings_title).toBe('Options title')
    expect(site.site_settings_phone).toBe('+90 212 000 00 00')
    expect(site.footer_phone).toBe('+90 212 111 11 11')
    expect(site.phone).toBeUndefined()
    expect(site.show_social).toBe(true)
    expect(fields.show_social).toMatchObject({ type: 'boolean', description: 'ACF' })
    // A reference resolves to the store entry.
    expect(fields.featured).toMatchObject({ type: 'relation', model: 'posts' })
    expect(site.featured).toBe(hexId(`posts:${post.slug}`))
    expect(report.acf_options).toMatchObject({ site_settings_phone: 'string', footer_phone: 'string', show_social: 'boolean', featured: 'relation:posts' })
    // Secret field types stay out, as on a post.
    expect(JSON.stringify(site)).not.toContain('"email"')
    expect(storeViolations(files).violations).toEqual([])
  })

  it('leave ACF\'s default `acf-options-` slug off the prefix', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const { files } = rawToContentrain({
      ...raw,
      acf_options: [
        { slug: 'acf-options-footer', title: 'Footer', post_id: 'options', fields: { phone: { value: 'a', type: 'text' } } },
        { slug: 'acf-options-contact-details', title: 'Contact details', post_id: 'options', fields: { phone: { value: 'b', type: 'text' } } },
        { slug: 'acf-options', title: 'Options', post_id: 'options', fields: { phone: { value: 'c', type: 'text' } } },
      ],
    })
    const site = JSON.parse(files['.contentrain/content/site/site/data.json']!)
    expect(site).toMatchObject({ footer_phone: 'a', contact_details_phone: 'b', acf_options_phone: 'c' })
    expect(site.acf_options_footer_phone).toBeUndefined()
  })

  it('never drop a field whose prefixed name is already taken: it gets a counter and a report line', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const { files, report } = rawToContentrain({
      ...raw,
      acf_options: [
        { slug: 'acf-options-footer', title: 'Footer', post_id: 'options', fields: { phone: { value: 'footer page', type: 'text' } } },
        { slug: 'contact', title: 'Contact', post_id: 'options', fields: {
          phone: { value: 'contact page', type: 'text' },
          footer_phone: { value: 'literal', type: 'text' },
        } },
      ],
    })
    const site = JSON.parse(files['.contentrain/content/site/site/data.json']!)
    // The literal name keeps it; the prefixed one moves over, and nothing is lost.
    expect(site).toMatchObject({ footer_phone: 'literal', footer_phone_2: 'footer page', contact_phone: 'contact page' })
    expect(report.acf_options_renamed).toEqual({ footer_phone_2: 'acf-options-footer.phone' })
    expect(report.acf_options).toMatchObject({ footer_phone: 'string', footer_phone_2: 'string', contact_phone: 'string' })
  })

  it('change nothing when the source has none', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const { files, report } = rawToContentrain(raw)
    expect(Object.keys(JSON.parse(files['.contentrain/models/site.json']!).fields).toSorted()).toEqual(['language', 'tagline', 'title', 'url'])
    expect(report.acf_options).toEqual({})
    expect(report.acf_options_renamed).toEqual({})
  })
})

describe('an untyped ACF field of attachment ids', () => {
  const build = async (fields: Array<Record<string, unknown>>, ids: number[]) => {
    const { raw: base } = await parseWxr(FIXTURE)
    const hello = base.posts.find((p) => p.slug === 'hello-world')!
    const media = ids.map((id) => ({ ...base.attachments[0]!, id }))
    const raw: RawIR = {
      ...base,
      provenance: { kind: 'bridge', tool: 'contentrain-bridge' },
      attachments: media,
      posts: [...base.posts.filter((p) => p.type !== 'team_member'), ...fields.map((acf, i) => ({ ...hello, id: 500 + i, slug: `member-${i}`, type: 'team_member', acf: Object.fromEntries(Object.entries(acf).map(([k, value]) => [k, { value }])) }))],
    }
    const { files, report } = rawToContentrain(raw, { updatedBy: 'test' })
    return { files, report, model: JSON.parse(files['.contentrain/models/team-member.json']!), entries: Object.values(JSON.parse(files['.contentrain/content/custom/team-member/data.json']!)) as Array<Record<string, unknown>> }
  }

  it('becomes a media relation when every value is an attachment id, and the id never stays a text', async () => {
    const { model, entries } = await build([{ photo: '84' }, { photo: 85 }], [84, 85])
    expect(model.fields.photo).toMatchObject({ type: 'relation', model: 'media' })
    for (const entry of entries) expect(['84', '85']).not.toContain(entry.photo)
    expect(entries.map((e) => e.photo).toSorted()).toEqual([hexId('media:84'), hexId('media:85')].toSorted())
  })

  it('stays what its values say when a number only coincides with an attachment id', async () => {
    // 85 is a media id, 14 is not: the field is a count, not a photo.
    const { model, entries } = await build([{ team_size: 85 }, { team_size: 14 }], [84, 85])
    expect(model.fields.team_size.type).not.toBe('relation')
    expect(entries.map((e) => e.team_size).toSorted()).toEqual([14, 85])
    // A lone value that happens to be an id counts too: one entry is all the evidence there is, so it is a media field.
    const lone = await build([{ team_size: 85 }], [84, 85])
    expect(lone.model.fields.team_size).toMatchObject({ type: 'relation', model: 'media' })
  })

  it('keeps a typed field typed, even when its values are attachment ids', async () => {
    const { raw: base } = await parseWxr(FIXTURE)
    const hello = base.posts.find((p) => p.slug === 'hello-world')!
    const raw: RawIR = { ...base, attachments: [{ ...base.attachments[0]!, id: 84 }], posts: [{ ...hello, id: 600, slug: 'm', type: 'team_member', acf: { badge: { value: 84, type: 'number' } } }] }
    const { files } = rawToContentrain(raw, { updatedBy: 'test' })
    expect(JSON.parse(files['.contentrain/models/team-member.json']!).fields.badge.type).toBe('number')
  })
})

describe('ACF image, file and gallery fields that return ids', () => {
  const build = async (acf: Record<string, { value: unknown, type: string }>, ids: number[]) => {
    const { raw: base } = await parseWxr(FIXTURE)
    const hello = base.posts.find((p) => p.slug === 'hello-world')!
    const attachments = ids.map((id) => ({ ...base.attachments[0]!, id, url: `https://example.test/wp-content/uploads/${id}.jpg` }))
    const raw: RawIR = {
      ...base,
      attachments,
      posts: [...base.posts.filter((p) => p.type !== 'team_member'), { ...hello, id: 700, slug: 'member', type: 'team_member', acf }],
    }
    const { files, report } = rawToContentrain(raw, { updatedBy: 'test' })
    return { report, model: JSON.parse(files['.contentrain/models/team-member.json']!), entry: Object.values(JSON.parse(files['.contentrain/content/custom/team-member/data.json']!))[0] as Record<string, unknown> }
  }

  it('image and file resolve the id to the attachment address, never keeping the id as text', async () => {
    const { model, entry } = await build({ photo: { value: '35', type: 'image' }, cv: { value: 36, type: 'file' } }, [35, 36])
    expect(model.fields.photo.type).toBe('image')
    expect(entry.photo).toBe('https://example.test/wp-content/uploads/35.jpg')
    expect(entry.cv).toBe('https://example.test/wp-content/uploads/36.jpg')
  })

  it('an id the export does not hold is left out and counted in the report', async () => {
    const { entry, report } = await build({ photo: { value: '999', type: 'image' } }, [35])
    expect(entry).not.toHaveProperty('photo')
    expect(report.acf_media_unknown).toEqual({ photo: 1 })
  })

  it('an address, or an attachment object, still passes as before', async () => {
    const { entry } = await build({ photo: { value: 'https://cdn.test/a.jpg', type: 'image' }, cv: { value: { ID: 36, url: 'https://cdn.test/cv.pdf', filename: 'cv.pdf' }, type: 'file' } }, [36])
    expect(entry.photo).toBe('https://cdn.test/a.jpg')
    expect(entry.cv).toBe('https://cdn.test/cv.pdf')
  })

  it('a gallery of ids becomes media references; an unknown id is dropped and counted', async () => {
    const { entry, report } = await build({ pics: { value: [35, 36, 999], type: 'gallery' } }, [35, 36])
    expect(entry.pics).toEqual([hexId('media:35'), hexId('media:36')])
    expect(report.dropped_relations).toBeGreaterThanOrEqual(1)
  })
})

describe('post bodies and Gutenberg block delimiters', () => {
  it('strips only the delimiters; the markup inside and other comments stay', () => {
    const body = '<!-- wp:paragraph -->\n<p>Hello</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:image {"id":35,"sizeSlug":"large"} -->\n<figure><img src="a.jpg"/></figure>\n<!-- /wp:image -->\n<!-- wp:separator /-->\n<!-- keep me -->'
    expect(stripBlockDelimiters(body)).toBe('<p>Hello</p>\n\n<figure><img src="a.jpg"/></figure>\n<!-- keep me -->')
  })

  it('tells which self-closing (server-rendered) blocks left nothing behind', () => {
    const seen: string[] = []
    const out = stripBlockDelimiters('<!-- wp:latest-posts {"postsToShow":3} /-->\n<!-- wp:block {"ref":12} /-->\n<!-- wp:acme/map /-->\n<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->', (n) => seen.push(n))
    expect(out).toBe('<p>x</p>')
    expect(seen).toEqual(['latest-posts', 'block', 'acme/map'])
  })

  it('leaves a body with no blocks alone', () => {
    expect(stripBlockDelimiters('<p>Classic</p>')).toBe('<p>Classic</p>')
  })
})
