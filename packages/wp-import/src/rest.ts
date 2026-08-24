// Public/authenticated WordPress REST → RawIR.
//
// The lowest rungs of the source-access ladder. What REST cannot see (menus,
// rest:false CPTs, unregistered meta) is simply absent from the result —
// absence at a low rung is information, not an error, and the manifest layer
// decides what to recommend about it.

import type { RawIR, RawAttachment, RawComment, RawPost, RawTerm, RawTermRef, SourceAccessKind } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { strip, SKIP_TYPES } from './core.js'

const iso = (gmt: string | undefined): string | null => (gmt ? `${gmt}Z` : null)
const approvedOf = (status: string | undefined): RawComment['approved'] =>
  status === 'approved' ? '1' : status === 'hold' ? '0' : status === 'spam' ? 'spam' : status === 'trash' ? 'trash' : (status ?? '1')

export interface RestImportOptions {
  origin: string
  /** Injectable for tests and for hosts that need custom dispatch. */
  fetchImpl?: typeof fetch
  /** WordPress Application Password credentials — lifts the rung to rest_auth. */
  auth?: { user: string; appPassword: string }
  perPage?: number
  tool?: string
}

export interface RestImportResult {
  raw: RawIR
  warnings: string[]
}

interface RestPost {
  id: number
  slug: string
  status?: string
  type?: string
  link?: string
  title?: { rendered?: string }
  content?: { rendered?: string }
  excerpt?: { rendered?: string }
  date_gmt?: string
  modified_gmt?: string
  author?: number
  parent?: number
  menu_order?: number
  sticky?: boolean
  comment_status?: string
  ping_status?: string
  featured_media?: number
  categories?: number[]
  tags?: number[]
  meta?: Record<string, unknown>
}

export async function fetchRestRawIR(options: RestImportOptions): Promise<RestImportResult> {
  const origin = options.origin.replace(/\/$/, '')
  const doFetch = options.fetchImpl ?? fetch
  const perPage = options.perPage ?? 100
  const warnings: string[] = []
  const headers: Record<string, string> = { accept: 'application/json' }
  if (options.auth) {
    headers.authorization = `Basic ${Buffer.from(`${options.auth.user}:${options.auth.appPassword}`).toString('base64')}`
  }

  const getAll = async <T>(path: string): Promise<T[]> => {
    const url = (page: number) => `${origin}/wp-json/wp/v2/${path}${path.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`
    const first = await doFetch(url(1), { headers })
    if (!first.ok) {
      warnings.push(`${path}: HTTP ${first.status} — skipped`)
      return []
    }
    const totalPages = Number(first.headers.get('x-wp-totalpages') ?? '1') || 1
    const firstPage = (await first.json()) as T[]
    if (totalPages <= 1) return firstPage
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_v, i) =>
        doFetch(url(i + 2), { headers }).then(async (r) => (r.ok ? ((await r.json()) as T[]) : [])),
      ),
    )
    return firstPage.concat(...rest)
  }

  interface RestType { slug: string; rest_base?: string }
  const typesResp = await doFetch(`${origin}/wp-json/wp/v2/types`, { headers })
  const types: Record<string, RestType> = typesResp.ok ? ((await typesResp.json()) as Record<string, RestType>) : {}
  if (!typesResp.ok) warnings.push(`types: HTTP ${typesResp.status} — importing posts and pages only`)
  const postTypes = Object.values(types).filter(
    (t) => t.rest_base && !SKIP_TYPES.test(t.slug) && t.slug !== 'attachment',
  )
  const bases = postTypes.length ? postTypes.map((t) => ({ slug: t.slug, base: t.rest_base! })) : [
    { slug: 'post', base: 'posts' },
    { slug: 'page', base: 'pages' },
  ]

  interface RestTerm { id: number; slug: string; name: string; taxonomy?: string; parent?: number; description?: string }
  interface RestUser { id: number; slug: string; name: string }
  interface RestMedia {
    id: number
    slug: string
    title?: { rendered?: string }
    source_url?: string
    alt_text?: string
    caption?: { rendered?: string }
    mime_type?: string
    media_details?: { width?: number; height?: number; file?: string }
    post?: number | null
    date_gmt?: string
  }
  interface RestComment {
    id: number
    post: number
    parent?: number
    author?: number
    author_name?: string
    author_url?: string
    date_gmt?: string
    content?: { rendered?: string }
    status?: string
    type?: string
  }

  const [categories, tags, users, media, restComments, ...postLists] = await Promise.all([
    getAll<RestTerm>('categories'),
    getAll<RestTerm>('tags'),
    getAll<RestUser>('users'),
    getAll<RestMedia>('media'),
    getAll<RestComment>('comments'),
    ...bases.map((b) => getAll<RestPost>(b.base)),
  ])

  const termsById = new Map<number, RawTerm>()
  for (const [tax, list] of [
    ['category', categories],
    ['post_tag', tags],
  ] as const) {
    for (const t of list) {
      termsById.set(t.id, {
        id: t.id,
        taxonomy: tax,
        slug: t.slug,
        name: strip(t.name),
        parent: t.parent ? (list.find((x) => x.id === t.parent)?.slug ?? null) : null,
        parent_resolved: t.parent ? list.some((x) => x.id === t.parent) : null,
        description: t.description ?? '',
      })
    }
  }
  const userById = new Map(users.map((u) => [u.id, u]))

  const posts: RawPost[] = []
  for (const [i, base] of bases.entries()) {
    for (const p of postLists[i] ?? []) {
      const termRefs: RawTermRef[] = [...(p.categories ?? []), ...(p.tags ?? [])].map((id) => {
        const t = termsById.get(id)
        return t
          ? { taxonomy: t.taxonomy, slug: t.slug, name: t.name, resolved: true }
          : { taxonomy: 'category', slug: String(id), name: String(id), resolved: false }
      })
      const author = p.author ? (userById.get(p.author)?.slug ?? null) : null
      const meta: Record<string, unknown> = { ...(p.meta && typeof p.meta === 'object' ? p.meta : {}) }
      if (p.featured_media) meta._thumbnail_id = String(p.featured_media)
      posts.push({
        id: p.id,
        type: base.slug,
        status: p.status ?? 'publish',
        slug: p.slug,
        title: p.title?.rendered ?? '',
        link: p.link ?? null,
        guid: null,
        author,
        date: iso(p.date_gmt),
        modified: iso(p.modified_gmt),
        content: p.content?.rendered ?? '',
        excerpt: p.excerpt?.rendered ?? '',
        parent: p.parent || null,
        menu_order: p.menu_order ?? 0,
        sticky: p.sticky ?? false,
        password: null,
        comment_status: p.comment_status ?? null,
        ping_status: p.ping_status ?? null,
        terms: termRefs,
        meta,
      })
    }
  }

  const attachments: RawAttachment[] = media.map((m) => ({
    id: m.id,
    title: strip(m.title?.rendered) || m.slug,
    slug: m.slug,
    url: m.source_url ?? null,
    alt: m.alt_text ?? '',
    caption: strip(m.caption?.rendered),
    file: m.media_details?.file ?? null,
    image_meta: m.media_details ?? null,
    mime: m.mime_type ?? null,
    parent: m.post ?? null,
    parent_resolved: m.post ? posts.some((p) => p.id === m.post) : null,
    date: iso(m.date_gmt),
  }))

  const postIds = new Set(posts.map((p) => p.id))
  const commentIds = new Set(restComments.map((c) => c.id))
  const comments: RawComment[] = restComments.map((c) => ({
    id: c.id,
    post: c.post,
    post_type: posts.find((p) => p.id === c.post)?.type,
    parent: c.parent || null,
    parent_resolved: c.parent ? commentIds.has(c.parent) : null,
    author: strip(c.author_name) || 'anonymous',
    email: null,
    url: c.author_url || null,
    date: iso(c.date_gmt),
    date_gmt: c.date_gmt ?? null,
    content: c.content?.rendered ?? '',
    approved: approvedOf(c.status),
    type: c.type ?? 'comment',
    user_id: c.author || null,
  }))
  for (const c of comments) if (!postIds.has(c.post)) warnings.push(`comment ${c.id}: post ${c.post} not in fetched set`)

  const kind: SourceAccessKind = options.auth ? 'rest_auth' : 'rest_public'
  const raw: RawIR = {
    version: MIGRATION_CONTRACT_VERSION,
    provenance: { kind, tool: options.tool ?? '@contentrain/wp-import' },
    site: { url: origin },
    authors: users.map((u) => ({ id: u.id, login: u.slug, display_name: strip(u.name) || u.slug, email: null })),
    terms: [...termsById.values()],
    posts,
    attachments,
    comments,
  }
  return { raw, warnings }
}
