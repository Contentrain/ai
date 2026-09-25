// Public/authenticated WordPress REST → RawIR.
//
// The lowest rungs of the source-access ladder. What REST cannot see (rest:false
// CPTs, unregistered meta; menus without an application password) is absent from the result —
// absence at a low rung is information, not an error, and the manifest layer
// decides what to recommend about it.

import type { RawAcfValue, RawIR, RawAttachment, RawComment, RawLanguagePair, RawMenu, RawPost, RawTerm, RawTermRef, SourceAccessKind } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { strip, SKIP_TYPES, PROTECTED } from './core.js'
import { acfIsSecret, acfScrub } from './acf.js'
import { blockMenus, classicMenus, type MenuContext, type RestMenu, type RestMenuItem, type RestNavigation, type RestTemplate, type RestTemplatePart } from './rest-menus.js'

const iso = (gmt: string | undefined): string | null => (gmt ? `${gmt}Z` : null)
const approvedOf = (status: string | undefined): RawComment['approved'] =>
  status === 'approved' ? '1' : status === 'hold' ? '0' : status === 'spam' ? 'spam' : status === 'trash' ? 'trash' : (status ?? '1')

export interface RestImportOptions {
  origin: string
  /** Injectable for tests and for hosts that need custom dispatch. */
  fetchImpl?: typeof fetch
  /**
   * WordPress Application Password credentials — lifts the rung to rest_auth.
   * With them, post types are listed with every non-trash status
   * (`AUTH_POST_STATUSES`) in the edit context, and comments with held ones
   * too; anonymous REST only ever returns published posts and approved
   * comments. A credential the site refuses for that falls back to the
   * public listing, with a warning.
   */
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
  /**
   * Whether the credential was honoured, for callers that must act on it
   * without reading `warnings`. `none`: no `auth` given. `accepted`: every
   * listing it unlocks was read with it. `rejected`: at least one was not —
   * `fell_back` names each (`posts`, `pages`, a CPT's rest base, `comments`,
   * `comments:hold`), and those came from the public listing instead, or not
   * at all for `comments:hold`, which has none.
   */
  credential: { status: 'none' | 'accepted' | 'rejected'; fell_back: string[] }
  /**
   * What this rung could not read, as codes a caller can act on (the text is in `warnings`).
   * `menus_require_auth`: menus and block navigation are only readable with an application password
   * of a user who may edit theme options — none was given, the site rejected it, or it lacks that right.
   * `acf_partial`: the site runs ACF / Secure Custom Fields; REST shows only the field groups set to
   * `show_in_rest` (off by default) and no options page — the Bridge export reads the rest. Where the site
   * states no field types (plain ACF, no `<name>_source`), a secret field is recognised by its name only.
   */
  gaps: string[]
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
  /** Edit context only. */
  password?: string
  comment_status?: string
  ping_status?: string
  featured_media?: number
  categories?: number[]
  tags?: number[]
  meta?: Record<string, unknown>
  /**
   * ACF / SCF fields of the groups shown in REST (`show_in_rest`). SCF adds `<name>_source`
   * (`{ type, label, formatted_value }`) beside each value; plain ACF sends the value only.
   */
  acf?: Record<string, unknown> | unknown[]
  /** Polylang: language slug of the post and its translation group (`{ en: 12, tr: 34 }`, self included). */
  lang?: string
  translations?: Record<string, number>
  /** WPML: locale of the post and its other translations. */
  wpml_current_locale?: string
  wpml_translations?: Array<{ locale?: string; id?: number }>
}

/** What a credential lists beyond `publish`: drafts, scheduled, in-review and private posts. Trash stays out. */
export const AUTH_POST_STATUSES = ['publish', 'future', 'draft', 'pending', 'private'] as const
/** Comment listings for a credential: WP's `status` takes one value, so approved and held are two requests. */
const AUTH_COMMENT_STATUSES = ['approve', 'hold'] as const
const DENIED = new Set([400, 401, 403])
/** REST taxonomies that hold no content: menus, block-pattern categories, multilingual bookkeeping. */
const NOT_CONTENT_TAXONOMIES = new Set(['category', 'post_tag', 'nav_menu', 'wp_pattern_category', 'post_format', 'language', 'post_translations', 'term_language', 'term_translations'])
/** A comment listing's name in `credential.fell_back`: `comments` (approved) or `comments:hold`. */
const commentKey = (status: string): string => (status === 'approve' ? 'comments' : `comments:${status}`)

/**
 * ACF fields of one REST post. `<name>_source` (SCF) states each field's type and label; a secret — a
 * `password` field, or, when no type is stated, a field named like one — is never read. ACF answers `[]`
 * for a post with no field group in REST.
 */
function acfOf(acf: RestPost['acf']): { acf?: Record<string, RawAcfValue> } {
  if (!acf || Array.isArray(acf) || typeof acf !== 'object') return {}
  const out: Record<string, RawAcfValue> = {}
  for (const [name, value] of Object.entries(acf)) {
    if (name.endsWith('_source') && name.slice(0, -'_source'.length) in acf) continue
    const source = acf[`${name}_source`] as { type?: unknown; label?: unknown } | undefined
    const type = typeof source?.type === 'string' ? source.type : undefined
    if (acfIsSecret(name, type)) continue
    out[name] = { value: acfScrub(value), ...(type ? { type } : {}), ...(typeof source?.label === 'string' && source.label ? { label: source.label } : {}) }
  }
  return Object.keys(out).length ? { acf: out } : {}
}

/** What a visitor can open: published, not behind a post password. */
const visible = (p: RawPost): boolean => p.status === 'publish' && !p.password

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
  const anonymous: Record<string, string> = { accept: 'application/json' }
  let headers = anonymous
  if (options.auth) {
    headers = { ...anonymous, authorization: `Basic ${Buffer.from(`${options.auth.user}:${options.auth.appPassword}`).toString('base64')}` }
  }
  const fellBack = new Set<string>()
  // WordPress answers a wrong Application Password with 401 on every route,
  // public ones too, so a rejected credential is found once and dropped:
  // sent on, it would also empty the public listings the import falls back to.
  let rejected = false
  if (options.auth) {
    const me = await doFetch(`${origin}/wp-json/wp/v2/users/me`, { headers })
    await me.body?.cancel()
    if (me.status === 401 || me.status === 403) {
      rejected = true
      headers = anonymous
      warnings.push(`credential: HTTP ${me.status} on users/me — the site rejected it; imported the public listings only`)
    }
  }

  /**
   * Every page of `path`. With `fallback`, a first page the site refuses
   * (400/401/403 — the credential may not list those statuses or the edit
   * context) is retried as `fallback` instead of dropping the collection;
   * an empty `fallback` means there is nothing public to retry, so it is
   * skipped with that warning. The retry is anonymous, and `key` goes into
   * `credential.fell_back`.
   */
  const getAll = async <T>(path: string, fallback?: string, key?: string, send = headers): Promise<T[]> => {
    const label = path.split('?')[0]!
    const url = (page: number) => `${origin}/wp-json/wp/v2/${path}${path.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`
    // Hold the slot until the body is consumed, not merely until headers arrive.
    const pageData = (page: number) => schedule(async () => {
      const response = await doFetch(url(page), { headers: send })
      if (!response.ok) {
        await response.body?.cancel()
        if (page === 1 && fallback !== undefined && DENIED.has(response.status)) return { items: [] as T[], pages: 1, denied: response.status }
        warnings.push(`${label}: page ${page} HTTP ${response.status} — skipped`)
        return { items: [] as T[], pages: 1 }
      }
      const pages = Number(response.headers.get('x-wp-totalpages') ?? '1')
      if (!Number.isSafeInteger(pages) || pages < 0) throw new Error(`${path}: invalid x-wp-totalpages`)
      const items = await response.json() as T[]
      if (!Array.isArray(items)) throw new Error(`${path}: page ${page} is not a collection`)
      return { items, pages: Math.max(1, pages), denied: undefined as number | undefined }
    })
    const first = await pageData(1)
    if (first.denied !== undefined) {
      warnings.push(`${label}: HTTP ${first.denied} for ${path.split('?')[1]} with the credential — ${fallback ? 'fell back to the public listing' : 'skipped (no public listing)'}`)
      fellBack.add(key ?? label)
      return fallback ? getAll<T>(fallback, undefined, undefined, anonymous) : []
    }
    const totalPages = first.pages
    const firstPage = first.items
    const wanted = maxPages !== undefined ? Math.min(totalPages, maxPages) : totalPages
    if (wanted < totalPages) {
      warnings.push(`${label}: ${totalPages} pages, fetched ${wanted} (maxPages) — ${totalPages - wanted} pages skipped`)
    }
    if (wanted <= 1) return firstPage
    const rest = await Promise.all(
      Array.from({ length: wanted - 1 }, (_v, i) =>
        pageData(i + 2).then((r) => r.items),
      ),
    )
    return firstPage.concat(...rest)
  }

  // The site's own name and tagline (`/wp-json/` index, public): without them the store's site singleton says "Site".
  // Advisory: an index that does not answer leaves them out, as before.
  const about = await schedule(async () => {
    try {
      const index = await doFetch(`${origin}/wp-json/`, { headers })
      if (!index.ok) { await index.body?.cancel(); return null }
      return (await index.json()) as { name?: unknown; description?: unknown; url?: unknown; home?: unknown } | null
    } catch { return null }
  })

  interface RestType { slug: string; rest_base?: string; viewable?: boolean }
  // `viewable` (has public addresses) is only in the edit context: with a credential, ask for it.
  let typesResp = await doFetch(`${origin}/wp-json/wp/v2/types${options.auth && !rejected ? '?context=edit' : ''}`, { headers })
  if (!typesResp.ok && options.auth && !rejected) {
    await typesResp.body?.cancel()
    typesResp = await doFetch(`${origin}/wp-json/wp/v2/types`, { headers: anonymous })
  }
  const types: Record<string, RestType> = typesResp.ok ? ((await typesResp.json()) as Record<string, RestType>) : {}
  if (!typesResp.ok) warnings.push(`types: HTTP ${typesResp.status} — importing posts and pages only`)
  const postTypes = Object.values(types).filter(
    (t) => t.rest_base && !SKIP_TYPES.test(t.slug) && t.slug !== 'attachment',
  )
  // A type WordPress says has no public address (`viewable: false`, e.g. testimonials used inside pages)
  // is still content, but its REST `link` is not an address: it is imported without one.
  const notViewable = new Set(postTypes.filter((t) => t.viewable === false).map((t) => t.slug))
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

  // Anonymous: WP's defaults (published posts, approved comments). With a
  // credential: every non-trash status, and held comments as a second listing.
  // A credential rejected outright unlocks nothing: every listing it would have read fell back.
  if (rejected) {
    for (const b of bases) fellBack.add(b.base)
    for (const status of AUTH_COMMENT_STATUSES) fellBack.add(commentKey(status))
  }
  const authed = options.auth !== undefined && !rejected
  const postListing = (base: string): Promise<RestPost[]> =>
    authed ? getAll<RestPost>(`${base}?status=${AUTH_POST_STATUSES.join(',')}&context=edit`, base, base) : getAll<RestPost>(base)
  const commentListing = async (): Promise<RestComment[]> => {
    if (!authed) return getAll<RestComment>('comments')
    const lists = await Promise.all(AUTH_COMMENT_STATUSES.map((status) =>
      // Approved comments are public, so a refused credential still gets them; held ones have no public listing.
      getAll<RestComment>(`comments?status=${status}&context=edit`, status === 'approve' ? 'comments' : '', commentKey(status))))
    const byId = new Map<number, RestComment>()
    for (const c of lists.flat()) if (!byId.has(c.id)) byId.set(c.id, c)
    return [...byId.values()]
  }
  // Custom taxonomies in REST (a CPT's `project_type`): their terms and each post's links to them.
  // Menus, block-pattern categories and multilingual bookkeeping are not content taxonomies.
  interface RestTaxonomy { slug: string; rest_base?: string }
  const taxResp = await schedule(async () => {
    try {
      const r = await doFetch(`${origin}/wp-json/wp/v2/taxonomies`, { headers })
      if (!r.ok) { await r.body?.cancel(); return {} }
      return (await r.json()) as Record<string, RestTaxonomy>
    } catch { return {} }
  })
  const extraTaxonomies = Object.values(taxResp && typeof taxResp === 'object' ? taxResp : {})
    .filter((t) => t.rest_base && /^[\w-]+$/.test(t.rest_base) && !NOT_CONTENT_TAXONOMIES.has(t.slug))
    .map((t) => ({ taxonomy: t.slug, base: t.rest_base! }))
    .toSorted((a, b) => a.taxonomy.localeCompare(b.taxonomy))
  const [categories, tags, users, media, restComments, ...lists] = await Promise.all([
    getAll<RestTerm>('categories'),
    getAll<RestTerm>('tags'),
    getAll<RestUser>('users'),
    getAll<RestMedia>('media'),
    commentListing(),
    ...extraTaxonomies.map((t) => getAll<RestTerm>(t.base)),
    ...bases.map((b) => postListing(b.base)),
  ])
  const extraTerms = lists.slice(0, extraTaxonomies.length) as RestTerm[][]
  const postLists = lists.slice(extraTaxonomies.length) as RestPost[][]

  const termsById = new Map<number, RawTerm>()
  for (const [tax, list] of [
    ['category', categories],
    ['post_tag', tags],
    ...extraTaxonomies.map((t, i) => [t.taxonomy, extraTerms[i] ?? []] as const),
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
  // Translation groups, one pair per group. Polylang's `translations` already
  // includes the post itself; WPML lists the OTHER translations, so add self.
  const languagePairs: RawLanguagePair[] = []
  const seenGroups = new Set<string>()
  const recordGroup = (self: RestPost, lang: string | null) => {
    const translations: Record<string, number> = {}
    if (self.translations && typeof self.translations === 'object') {
      for (const [code, id] of Object.entries(self.translations)) if (typeof id === 'number') translations[code] = id
    } else if (Array.isArray(self.wpml_translations)) {
      for (const t of self.wpml_translations) if (t.locale && typeof t.id === 'number') translations[t.locale] = t.id
      if (lang) translations[lang] = self.id
    }
    const ids = Object.values(translations)
    if (ids.length < 2) return
    const key = [...ids].toSorted((a, b) => a - b).join(',')
    if (seenGroups.has(key)) return
    seenGroups.add(key)
    languagePairs.push({ post: self.id, translations })
  }
  for (const [i, base] of bases.entries()) {
    for (const p of postLists[i] ?? []) {
      const custom = extraTaxonomies.flatMap((t) => {
        const ids = (p as unknown as Record<string, unknown>)[t.base]
        return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === 'number') : []
      })
      const termRefs: RawTermRef[] = [...(p.categories ?? []), ...(p.tags ?? []), ...custom].map((id) => {
        const t = termsById.get(id)
        return t
          ? { taxonomy: t.taxonomy, slug: t.slug, name: t.name, resolved: true }
          : { taxonomy: 'category', slug: String(id), name: String(id), resolved: false }
      })
      const author = p.author ? (userById.get(p.author)?.slug ?? null) : null
      const meta: Record<string, unknown> = { ...(p.meta && typeof p.meta === 'object' ? p.meta : {}) }
      if (p.featured_media) meta._thumbnail_id = String(p.featured_media)
      const lang = (typeof p.lang === 'string' && p.lang) || (typeof p.wpml_current_locale === 'string' && p.wpml_current_locale) || null
      recordGroup(p, lang)
      posts.push({
        ...(lang ? { lang } : {}),
        id: p.id,
        type: base.slug,
        status: p.status ?? 'publish',
        slug: p.slug,
        title: p.title?.rendered ?? '',
        link: notViewable.has(base.slug) ? null : (p.link ?? null),
        guid: null,
        author,
        date: iso(p.date_gmt),
        modified: iso(p.modified_gmt),
        content: p.content?.rendered ?? '',
        excerpt: p.excerpt?.rendered ?? '',
        parent: p.parent || null,
        menu_order: p.menu_order ?? 0,
        sticky: p.sticky ?? false,
        password: p.password ? PROTECTED : null,
        comment_status: p.comment_status ?? null,
        ping_status: p.ping_status ?? null,
        terms: termRefs,
        meta,
        ...acfOf(p.acf),
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

  // ── menus: classic menus + published block navigation; both need `edit_theme_options` ──
  const gaps: string[] = []
  // ACF answers `acf` (at least `[]`) on every post of a type it knows: then REST shows only the field
  // groups set to `show_in_rest` (off by default) and never an options page. What it hides, only Bridge reads.
  if (postLists.some((list) => list.some((p) => p.acf !== undefined))) gaps.push('acf_partial')
  let menus: RawMenu[] = []
  if (!authed) {
    // Not a warning: without a working credential this is the rung's known limit, named for the caller in `gaps`.
    gaps.push('menus_require_auth')
  } else {
    const listing = async <T>(path: string): Promise<{ items: T[]; status: number }> => {
      const url = (page: number) => `${origin}/wp-json/wp/v2/${path}${path.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`
      const first = await schedule(async () => {
        const r = await doFetch(url(1), { headers })
        if (!r.ok) { await r.body?.cancel(); return { items: [] as T[], status: r.status, pages: 1 } }
        const items = await r.json() as T[]
        return { items: Array.isArray(items) ? items : [], status: r.status, pages: Math.max(1, Number(r.headers.get('x-wp-totalpages') ?? '1') || 1) }
      })
      const wanted = maxPages !== undefined ? Math.min(first.pages, maxPages) : first.pages
      const rest = await Promise.all(Array.from({ length: wanted - 1 }, (_v, i) => schedule(async () => {
        const r = await doFetch(url(i + 2), { headers })
        if (!r.ok) { await r.body?.cancel(); warnings.push(`${path.split('?')[0]}: page ${i + 2} HTTP ${r.status} — skipped`); return [] as T[] }
        const items = await r.json() as T[]
        return Array.isArray(items) ? items : []
      })))
      return { items: first.items.concat(...rest), status: first.status }
    }
    const [classic, items, navs, parts, templates] = await Promise.all([
      listing<RestMenu>('menus?context=edit'),
      listing<RestMenuItem>('menu-items?context=edit'),
      listing<RestNavigation>('navigation?context=edit&status=publish'),
      listing<RestTemplatePart>('template-parts?context=edit'),
      // Which template parts the pages use: a theme ships alternatives no template shows.
      listing<RestTemplate>('templates?context=edit&_fields=slug,content'),
    ])
    const denied = [classic, items, navs].filter((l) => DENIED.has(l.status))
    if (denied.length) {
      gaps.push('menus_require_auth')
      warnings.push(`menus: HTTP ${denied[0]!.status} with the credential — the user may not edit theme options; menus not read`)
    }
    for (const [name, l] of [['menus', classic], ['menu-items', items], ['navigation', navs]] as const) {
      if (!l.status || (l.status >= 400 && !DENIED.has(l.status) && l.status !== 404)) warnings.push(`${name}: HTTP ${l.status} — skipped`)
    }
    const slugOf = new Map(posts.filter(visible).map((p) => [p.id, p.slug]))
    const ctx: MenuContext = {
      origin,
      postSlug: (id) => slugOf.get(id),
      termSlug: (taxonomy, id) => { const t = termsById.get(id); return t && t.taxonomy === taxonomy ? t.slug : undefined },
      pages: posts.filter((p) => p.type === 'page' && p.status === 'publish' && !p.password).map((p) => ({ id: p.id, parent: p.parent ?? null, menu_order: p.menu_order ?? 0, title: strip(p.title), link: p.link ?? null, slug: p.slug })),
    }
    const dropped = { count: 0 }
    menus = classicMenus(DENIED.has(classic.status) ? [] : classic.items, DENIED.has(items.status) ? [] : items.items, ctx, dropped)
    menus.push(...blockMenus(DENIED.has(navs.status) ? [] : navs.items, parts.status < 400 ? parts.items : [], ctx, new Set(menus.map((m) => m.slug)), dropped, templates.status < 400 ? templates.items : []))
    // A count only: the titles of what was left out are exactly what must not travel.
    if (dropped.count) warnings.push(`menus: ${dropped.count} item(s) are drafts or point at content not proven public (unpublished, password-protected, or not read by this import) — left out`)
  }

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

  // The rung is what was actually read: a credential rejected outright read nothing.
  const kind: SourceAccessKind = authed ? 'rest_auth' : 'rest_public'
  const raw: RawIR = {
    version: MIGRATION_CONTRACT_VERSION,
    provenance: { kind, tool: options.tool ?? '@contentrain/wp-import' },
    site: {
      url: origin,
      ...(typeof about?.name === 'string' && strip(about.name) ? { title: strip(about.name) } : {}),
      ...(typeof about?.description === 'string' && strip(about.description) ? { description: strip(about.description) } : {}),
      // Where WordPress is installed and where the site is served, as WXR names them (they differ for a subdirectory install).
      ...(typeof about?.url === 'string' && about.url ? { base_site_url: about.url } : {}),
      ...(typeof about?.home === 'string' && about.home ? { base_blog_url: about.home } : {}),
    },
    authors: users.map((u) => ({ id: u.id, login: u.slug, display_name: strip(u.name) || u.slug, email: null })),
    terms: [...termsById.values()],
    posts,
    attachments,
    comments,
    ...(menus.length ? { menus } : {}),
    ...(languagePairs.length ? { language_pairs: languagePairs } : {}),
  }
  const credential: RestImportResult['credential'] = {
    status: !options.auth ? 'none' : fellBack.size ? 'rejected' : 'accepted',
    fell_back: [...fellBack].toSorted(),
  }
  return { raw, warnings, credential, gaps }
}
