// WXR (WordPress eXtended RSS) → RawIR.
//
// Streaming (sax) parse: a 100 MB export holds only its records in memory,
// never the XML. Ported from the measured import chain — the state machine,
// the meta decoding, and the resolution passes are the parts three sessions
// of corpus work already debugged; they are transliterated, not redesigned.

import sax from 'sax'
import type { Readable } from 'node:stream'
import type {
  RawIR,
  RawPost,
  RawAttachment,
  RawAuthor,
  RawComment,
  RawMenu,
  RawMenuItem,
  RawMenuTarget,
  RawTerm,
  RawTermRef,
  RawAcfValue,
} from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { tryUnserialize } from './php-unserialize.js'
import { strip } from './core.js'

export interface WxrStats {
  serialized: { detected: number; decoded: number; failed: number; keys: string[] }
  acf_fields: number
  unresolved_terms: number
  counts: Record<string, number>
}

export interface WxrParseResult {
  raw: RawIR
  stats: WxrStats
}

interface XItem {
  [k: string]: unknown
  terms: Array<{ taxonomy: string; slug: string; name?: string }>
  postmeta: Array<{ key?: string; value?: string }>
  comments: Array<Record<string, string | Array<{ key?: string; value?: string }>>>
}

const ts = (s: string | undefined): string | null =>
  !s || s.startsWith('0000-00-00') ? null : s.replace(' ', 'T')
const iso = (local: string | undefined, gmt: string | undefined): string | null =>
  gmt && !gmt.startsWith('0000') ? `${ts(gmt)}Z` : ts(local)
const num = (s: unknown): number => (s === '' || s == null ? 0 : Number(s))
const termKey = (tax: string, slug: string): string => `${tax}:${slug}`

export async function parseWxr(input: string | Readable, opts?: { tool?: string }): Promise<WxrParseResult> {
  const site: Record<string, unknown> = {}
  const authors: Array<Record<string, string>> = []
  const terms: Array<Record<string, string>> = []
  const items: XItem[] = []
  const stats: WxrStats = {
    serialized: { detected: 0, decoded: 0, failed: 0, keys: [] },
    acf_fields: 0,
    unresolved_terms: 0,
    counts: {},
  }
  const serializedKeySet = new Set<string>()

  // ── sax state machine (ported verbatim) ──
  const parser = sax.createStream(true, { trim: false })
  const path: string[] = []
  let text = ''
  let item: XItem | null = null
  let meta: { key?: string; value?: string } | null = null
  let comment: Record<string, string | Array<{ key?: string; value?: string }>> | null = null
  let cmeta: { key?: string; value?: string } | null = null
  let author: Record<string, string> | null = null
  let term: (Record<string, string> & { _tag?: string }) | null = null
  const channelText: Record<string, string> = {}

  const leaf = (name: string, into: Record<string, unknown>, map: Record<string, string>): void => {
    const target = map[name]
    if (target) into[target] = text
  }
  parser.on('opentag', (node) => {
    path.push(node.name)
    text = ''
    const n = node.name
    if (n === 'item') item = { terms: [], postmeta: [], comments: [] }
    else if (n === 'wp:postmeta') meta = {}
    else if (n === 'wp:comment') comment = { meta: [] }
    else if (n === 'wp:commentmeta') cmeta = {}
    else if (n === 'wp:author') author = {}
    else if (n === 'wp:category' || n === 'wp:tag' || n === 'wp:term') term = { _tag: n }
    else if (n === 'category' && item) {
      const attrs = node.attributes as Record<string, string>
      item.terms.push({ taxonomy: attrs.domain ?? '', slug: attrs.nicename ?? '' })
    }
  })
  parser.on('text', (t) => {
    text += t
  })
  parser.on('cdata', (t) => {
    text += t
  })
  parser.on('comment', (c) => {
    const m = /generator="([^"]*)"\s+created="([^"]*)"/.exec(c)
    if (m) {
      site.generator = m[1]
      site.export_date = m[2]
    }
  })
  parser.on('closetag', (n) => {
    const parent = path[path.length - 2]
    if (cmeta) {
      if (n === 'wp:meta_key') cmeta.key = text
      else if (n === 'wp:meta_value') cmeta.value = text
      else if (n === 'wp:commentmeta') {
        ;(comment!.meta as Array<{ key?: string; value?: string }>).push(cmeta)
        cmeta = null
      }
    } else if (comment) {
      const map: Record<string, string> = {
        'wp:comment_id': 'id',
        'wp:comment_author': 'author',
        'wp:comment_author_email': 'email',
        'wp:comment_author_url': 'url',
        'wp:comment_date': 'date',
        'wp:comment_date_gmt': 'date_gmt',
        'wp:comment_content': 'content',
        'wp:comment_approved': 'approved',
        'wp:comment_type': 'type',
        'wp:comment_parent': 'parent',
        'wp:comment_user_id': 'user_id',
      }
      leaf(n, comment, map)
      if (n === 'wp:comment') {
        item!.comments.push(comment)
        comment = null
      }
    } else if (meta) {
      if (n === 'wp:meta_key') meta.key = text
      else if (n === 'wp:meta_value') meta.value = text
      else if (n === 'wp:postmeta') {
        item!.postmeta.push(meta)
        meta = null
      }
    } else if (item) {
      if (n === 'category') {
        const t = item.terms.at(-1)
        if (t) t.name = text
      } else {
        const map: Record<string, string> = {
          title: 'title',
          link: 'link',
          'dc:creator': 'author',
          guid: 'guid',
          description: 'description',
          'content:encoded': 'content',
          'excerpt:encoded': 'excerpt',
          'wp:post_id': 'id',
          'wp:post_date': 'date',
          'wp:post_date_gmt': 'date_gmt',
          'wp:post_modified': 'modified',
          'wp:post_modified_gmt': 'modified_gmt',
          'wp:comment_status': 'comment_status',
          'wp:ping_status': 'ping_status',
          'wp:post_name': 'slug',
          'wp:status': 'status',
          'wp:post_parent': 'parent',
          'wp:menu_order': 'menu_order',
          'wp:post_type': 'type',
          'wp:post_password': 'password',
          'wp:is_sticky': 'sticky',
          'wp:attachment_url': 'attachment_url',
        }
        leaf(n, item, map)
        if (n === 'item') {
          items.push(item)
          item = null
        }
      }
    } else if (author) {
      leaf(n, author, {
        'wp:author_id': 'id',
        'wp:author_login': 'login',
        'wp:author_email': 'email',
        'wp:author_display_name': 'display_name',
        'wp:author_first_name': 'first_name',
        'wp:author_last_name': 'last_name',
      })
      if (n === 'wp:author') {
        authors.push(author)
        author = null
      }
    } else if (term) {
      leaf(n, term, {
        'wp:term_id': 'id',
        'wp:category_nicename': 'slug',
        'wp:category_parent': 'parent',
        'wp:cat_name': 'name',
        'wp:category_description': 'description',
        'wp:tag_slug': 'slug',
        'wp:tag_name': 'name',
        'wp:tag_description': 'description',
        'wp:term_taxonomy': 'taxonomy',
        'wp:term_slug': 'slug',
        'wp:term_parent': 'parent',
        'wp:term_name': 'name',
        'wp:term_description': 'description',
      })
      if (n === term._tag) {
        term.taxonomy = term._tag === 'wp:category' ? 'category' : term._tag === 'wp:tag' ? 'post_tag' : (term.taxonomy ?? '')
        delete term._tag
        terms.push(term)
        term = null
      }
    } else if (parent === 'channel') {
      leaf(n, channelText, {
        title: 'title',
        link: 'link',
        description: 'description',
        language: 'language',
        'wp:wxr_version': 'wxr_version',
        'wp:base_site_url': 'base_site_url',
        'wp:base_blog_url': 'base_blog_url',
      })
    }
    path.pop()
    text = ''
  })

  await new Promise<void>((resolve, reject) => {
    parser.on('end', () => resolve())
    parser.on('error', reject)
    if (typeof input === 'string') {
      parser.end(input)
    } else {
      input.pipe(parser)
    }
  })
  Object.assign(site, channelText)

  // ── post-processing: meta decode, ACF pairing, entity split, resolution flags ──
  const decodeMeta = (list: Array<{ key?: string; value?: string }>): { meta: Record<string, unknown>; serializedKeys: string[] } => {
    const out: Record<string, unknown> = {}
    const serializedKeys: string[] = []
    for (const { key, value } of list) {
      if (!key) continue
      const r = tryUnserialize(value ?? '')
      if (r.serialized) {
        stats.serialized.detected++
        serializedKeySet.add(key)
        if (r.ok) {
          stats.serialized.decoded++
          serializedKeys.push(key)
        } else stats.serialized.failed++
      }
      const v = r.ok ? r.value : (value ?? '')
      out[key] = key in out ? ([] as unknown[]).concat(out[key] as unknown[], [v]) : v
    }
    return { meta: out, serializedKeys }
  }
  const extractAcf = (metaObj: Record<string, unknown>): Record<string, RawAcfValue> => {
    const acf: Record<string, RawAcfValue> = {}
    for (const [k, v] of Object.entries(metaObj)) {
      if (k.startsWith('_') && typeof v === 'string' && /^field_[0-9a-f]+$/.test(v) && k.slice(1) in metaObj) {
        acf[k.slice(1)] = { value: metaObj[k.slice(1)], field_key: v }
      }
    }
    return acf
  }

  const termSet = new Set(terms.map((t) => termKey(t.taxonomy ?? '', t.slug ?? '')))

  interface Rec extends RawPost {
    attachment_url: string | null
    _comments: RawComment[]
  }
  const records: Rec[] = items.map((it) => {
    const { meta: m, serializedKeys } = decodeMeta(it.postmeta)
    const acf = extractAcf(m)
    stats.acf_fields += Object.keys(acf).length
    const id = num(it.id)
    const termRefs: RawTermRef[] = it.terms.map((t) => ({
      taxonomy: t.taxonomy,
      slug: t.slug,
      name: t.name ?? '',
      resolved: termSet.has(termKey(t.taxonomy, t.slug)),
    }))
    const comments: RawComment[] = it.comments.map((c) => ({
      id: num(c.id),
      post: id,
      post_type: (it.type as string) || 'post',
      parent: num(c.parent) || null,
      parent_resolved: null,
      author: (c.author as string) ?? '',
      email: (c.email as string) || null,
      url: (c.url as string) || null,
      date: iso(c.date as string, c.date_gmt as string),
      date_gmt: ts(c.date_gmt as string),
      content: (c.content as string) ?? '',
      approved: (c.approved as string | undefined) ?? '1',
      type: (c.type as string) || 'comment',
      user_id: num(c.user_id) || null,
      meta: decodeMeta((c.meta as Array<{ key?: string; value?: string }>) ?? []).meta,
    }))
    return {
      id,
      type: (it.type as string) || 'post',
      status: (it.status as string) || 'publish',
      slug: (it.slug as string) || '',
      title: (it.title as string) ?? '',
      link: (it.link as string) || null,
      guid: (it.guid as string) || null,
      author: (it.author as string) || null,
      date: iso(it.date as string, it.date_gmt as string),
      modified: iso(it.modified as string, it.modified_gmt as string),
      content: (it.content as string) ?? '',
      excerpt: (it.excerpt as string) ?? '',
      parent: num(it.parent) || null,
      menu_order: num(it.menu_order),
      sticky: it.sticky === '1',
      password: (it.password as string) || null,
      comment_status: (it.comment_status as string) || null,
      ping_status: (it.ping_status as string) || null,
      terms: termRefs,
      meta: m,
      serialized_keys: serializedKeys,
      acf,
      attachment_url: (it.attachment_url as string) || null,
      _comments: comments,
    }
  })
  for (const r of records) {
    for (const t of r.terms) if (!t.resolved && r.type !== 'nav_menu_item') stats.unresolved_terms++
  }

  const byId = new Map(records.map((r) => [r.id, r]))
  const posts: RawPost[] = records
    .filter((r) => r.type !== 'attachment' && r.type !== 'nav_menu_item')
    .map(({ attachment_url: _a, _comments: _c, ...p }) => p)
  const attachments: RawAttachment[] = records
    .filter((r) => r.type === 'attachment')
    .map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      url: r.attachment_url ?? r.guid ?? null,
      alt: typeof r.meta._wp_attachment_image_alt === 'string' ? r.meta._wp_attachment_image_alt : '',
      caption: r.excerpt,
      description: r.content,
      file: typeof r.meta._wp_attached_file === 'string' ? r.meta._wp_attached_file : null,
      image_meta: r.meta._wp_attachment_metadata ?? null,
      mime: guessMime(r.attachment_url ?? r.guid ?? ''),
      parent: r.parent,
      parent_resolved: r.parent ? byId.has(r.parent) : null,
      author: r.author,
      date: r.date,
      status: r.status,
      meta: r.meta,
    }))

  // ── menus: nav_menu terms + nav_menu_item posts (targets from meta) ──
  const postById = new Map(posts.map((p) => [p.id, p]))
  const termByIdNum = new Map(terms.map((t) => [num(t.id), t]))
  const menus: RawMenu[] = terms
    .filter((t) => t.taxonomy === 'nav_menu')
    .map((mt) => ({ id: num(mt.id) || null, slug: mt.slug ?? '', name: mt.name ?? '', items: [] as RawMenuItem[] }))
  const menuBySlug = new Map(menus.map((m) => [m.slug, m]))
  for (const r of records.filter((x) => x.type === 'nav_menu_item')) {
    const m = r.meta
    const type = m._menu_item_type as string | undefined
    const object = m._menu_item_object as string | undefined
    const objectId = num(m._menu_item_object_id)
    let target: RawMenuTarget
    if (type === 'custom') target = { kind: 'url', url: String(m._menu_item_url ?? ''), resolved: true }
    else if (type === 'post_type') {
      const p = postById.get(objectId)
      target = { kind: 'post', post_type: object ?? '', id: objectId || null, slug: p?.slug ?? null, resolved: !!p }
    } else if (type === 'taxonomy') {
      const t = termByIdNum.get(objectId)
      target = { kind: 'term', taxonomy: object ?? '', id: objectId || null, slug: t?.slug ?? null, resolved: !!t }
    } else if (type === 'post_type_archive') target = { kind: 'archive', post_type: object ?? '', resolved: true }
    else target = { kind: 'unknown', resolved: false }
    const parent = num(m._menu_item_menu_item_parent) || null
    const itemRec: RawMenuItem = {
      id: r.id,
      title: r.title || (('slug' in target && target.slug) || '') || '',
      order: r.menu_order,
      parent,
      url: (m._menu_item_url as string) || null,
      target,
      target_attr: (m._menu_item_target as string) || null,
      classes: ([] as string[]).concat((m._menu_item_classes as string[]) ?? []).filter(Boolean),
      description: r.content,
      status: r.status,
    }
    const menuSlug = r.terms.find((t) => t.taxonomy === 'nav_menu')?.slug
    const menu = menuSlug ? menuBySlug.get(menuSlug) : undefined
    if (menu) menu.items.push(itemRec)
  }
  const allMenuItemIds = new Set(menus.flatMap((m) => m.items.map((i) => i.id)))
  for (const m of menus) {
    for (const i of m.items) if (i.parent && !allMenuItemIds.has(i.parent)) i.parent_unresolved = true
  }

  // ── comments: threaded, parent resolution within the same post ──
  const comments: RawComment[] = []
  for (const r of records) {
    const ids = new Set(r._comments.map((c) => c.id))
    for (const c of r._comments) comments.push({ ...c, parent_resolved: c.parent ? ids.has(c.parent) : null })
  }

  const rawAuthors: RawAuthor[] = authors.map((a) => ({
    id: num(a.id) || null,
    login: a.login ?? '',
    email: a.email || null,
    display_name: a.display_name || a.login || '',
    first_name: a.first_name || null,
    last_name: a.last_name || null,
  }))
  const rawTerms: RawTerm[] = terms
    .filter((t) => t.taxonomy !== 'nav_menu')
    .map((t) => ({
      id: num(t.id) || null,
      taxonomy: t.taxonomy ?? '',
      slug: t.slug ?? '',
      name: t.name ?? '',
      parent: t.parent || null,
      parent_resolved: t.parent ? termSet.has(termKey(t.taxonomy ?? '', t.parent)) : null,
      description: t.description || '',
    }))

  stats.serialized.keys = [...serializedKeySet].toSorted()
  stats.counts = {
    items: records.length,
    posts: posts.length,
    attachments: attachments.length,
    terms: rawTerms.length,
    authors: rawAuthors.length,
    menus: menus.length,
    comments: comments.length,
  }

  const raw: RawIR = {
    version: MIGRATION_CONTRACT_VERSION,
    provenance: { kind: 'wxr', tool: opts?.tool ?? '@contentrain/wp-import' },
    site: {
      url: String(site.link ?? channelText.link ?? ''),
      title: strip(channelText.title),
      description: strip(channelText.description) || undefined,
      base_site_url: channelText.base_site_url,
      base_blog_url: channelText.base_blog_url,
      language: channelText.language ?? null,
      generator: (site.generator as string) ?? null,
      export_date: (site.export_date as string) ?? null,
      wxr_version: channelText.wxr_version ?? null,
    },
    authors: rawAuthors,
    terms: rawTerms,
    posts,
    attachments,
    menus,
    comments,
  }
  return { raw, stats }
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
}
function guessMime(u: string): string | null {
  const e = (u.split('?')[0]?.split('.').pop() ?? '').toLowerCase()
  return MIME[e] ?? null
}
