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
  /**
   * Requests in flight at once, across every collection. Default 4. A site
   * with 74 pages of posts, 40 of media and 37 of comments used to receive
   * ~150 simultaneous requests — enough to trip a host's rate limit or WAF.
   */
  concurrency?: number
  /**
   * Pages fetched per collection at most. Unset = all. A truncated collection
   * is named in `warnings` (with what was skipped), never silently shortened.
   */
  maxPages?: number
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

const positiveInteger = (name: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`)
  return value
}

export async function fetchRestRawIR(options: RestImportOptions): Promise<RestImportResult> {
  const origin = options.origin.replace(/\/$/, '')
  const doFetch = options.fetchImpl ?? fetch
  const perPage = positiveInteger('perPage', options.perPage ?? 100)
  if (perPage > 100) throw new RangeError('perPage must be at most 100')
  const concurrency = positiveInteger('concurrency', options.concurrency ?? 4)
  const maxPages = options.maxPages !== undefined ? positiveInteger('maxPages', options.maxPages) : undefined
  const warnings: string[] = []
  // One pool for the whole import: page fetches of every collection queue here,
  // so the cap holds even though collections are requested "in parallel".
  const queue: Array<() => Promise<void>> = []
  let running = 0
  const schedule = <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => task().then(resolve, reject))
      pump()
    })
  const pump = (): void => {
    while (running < concurrency && queue.length) {
      const task = queue.shift()!
      running++
      void task().finally(() => {
        running--
        pump()
      })
    }
  }
  const headers: Record<string, string> = { accept: 'application/json' }
  if (options.auth) {
    headers.authorization = `Basic ${Buffer.from(`${options.auth.user}:${options.auth.appPassword}`).toString('base64')}`
  }

  const getAll = async <T>(path: string): Promise<T[]> => {
    const url = (page: number) => `${origin}/wp-json/wp/v2/${path}${path.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`
    // Hold the slot until the body is consumed, not merely until headers arrive.
    const pageData = (page: number) => schedule(async () => {
      const response = await doFetch(url(page), { headers })
      if (!response.ok) {
        warnings.push(`${path}: page ${page} HTTP ${response.status} — skipped`)
        await response.body?.cancel()
        return { items: [] as T[], pages: 1 }
      }
      const pages = Number(response.headers.get('x-wp-totalpages') ?? '1')
      if (!Number.isSafeInteger(pages) || pages < 0) throw new Error(`${path}: invalid x-wp-totalpages`)
      const items = await response.json() as T[]
      if (!Array.isArray(items)) throw new Error(`${path}: page ${page} is not a collection`)
      return { items, pages: Math.max(1, pages) }
    })
    const first = await pageData(1)
    const totalPages = first.pages
    const firstPage = first.items
    const wanted = maxPages !== undefined ? Math.min(totalPages, maxPages) : totalPages
    if (wanted < totalPages) {
      warnings.push(`${path}: ${totalPages} pages, fetched ${wanted} (maxPages) — ${totalPages - wanted} pages skipped`)
    }
    if (wanted <= 1) return firstPage
    const rest = await Promise.all(
      Array.from({ length: wanted - 1 }, (_v, i) =>
        pageData(i + 2).then((r) => r.items),
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
