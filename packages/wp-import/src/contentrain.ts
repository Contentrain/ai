// RawIR → .contentrain content store, as a pure file map.
//
// Ported from the measured import chain (the "deviations from r4i" it carried
// are already folded in: PATH_PATTERNS-conformant layout, ContentrainConfig
// shape, meta files per locale). Two properties are load-bearing:
//
// 1. Identity formulas — hexId('posts:' + slug), hexId('category:' + slug) —
//    are shared with the REST path, so the same site imported twice (or via a
//    later delta) lands on the same entry ids.
// 2. The EntrySourceMap (wp post id → entry address) is produced HERE and only
//    here: this is the one place that knows both sides of the mapping, and the
//    comments intake downstream cannot exist without it.

import type { EntrySourceMap, FieldDef, ModelDefinition, RawIR, RawPost } from '@contentrain/types'
import { ACF_REFERENCE_TYPES, acfFieldDef, acfRows, acfScrub, acfValue, mergeFieldDef, type AcfReference } from './acf.js'
import {
  byValue,
  canon,
  coreFields,
  decodeSlug,
  hexId,
  PLUGIN_META,
  SKIP_TYPES,
  slugify,
  strip,
  taxModelId,
} from './core.js'

export interface ImportReport {
  slug_rewritten: number
  slug_fallback: number
  title_fallback: number
  meta_fields: Record<string, string>
  acf_fields: Record<string, string>
  /** ACF select/checkbox values outside their field's stated choices, left out (`field: count`). */
  acf_outside_choices: Record<string, number>
  skipped_types: string[]
  dropped_relations: number
  models: Record<string, { kind: string; domain: string; fields: number; entries: number }>
  /** Default first, then every other language seen on a post. One entry on a monolingual site. */
  locales: string[]
  /** Translation groups that were folded into one entry id across locales. */
  translation_groups: number
  /**
   * Password-protected posts imported as `draft`, whatever their WordPress
   * status. Their body is the protected text, and nothing downstream (query
   * SDK, emitter) enforces `visibility: password`, so publishing one would
   * put that text on a public site. Publish only after deciding what to show.
   */
  password_protected_drafts: number
  /**
   * The source named no site title (no REST index name, no WXR channel title): the `site` entry has no
   * `title`. The field stays required, so the store says what is missing rather than inventing a name.
   */
  site_title_missing: boolean
}

export interface ContentrainResult {
  files: Record<string, string>
  entry_source_map: EntrySourceMap
  report: ImportReport
}

type Entry = Record<string, unknown>
type Meta = { status: string; source: string; updated_by: string; publish_at?: string }

const pick = (o: Record<string, unknown>, keys: Set<string>): Entry =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => keys.has(k) && v !== undefined && v !== null && v !== ''))
const typeModelId = (t: string): string => (t === 'post' ? 'posts' : t === 'page' ? 'pages' : t.replace(/_/g, '-'))
const domainOf = (t: string): string => (t === 'post' ? 'blog' : t === 'page' ? 'site' : 'custom')

/** `en_US` / `tr-TR` / `en` → `en`: the store's locale is the primary subtag. */
const normLocale = (code: string | null | undefined): string => (code ?? '').split(/[-_]/)[0]?.toLowerCase() ?? ''

/** Multilingual-plugin taxonomies that carry language bookkeeping, not content. */
const LANGUAGE_TAXONOMIES = new Set(['language', 'post_translations', 'term_language', 'term_translations'])

/**
 * A relation field over `targets`: its declared model, and how a reference into
 * it is stored.
 *
 * With several targets the id alone does not say which model's entry it is, so
 * the reference is the pair `{ model, ref }`. With one there is nothing to
 * choose between: the field is single-target and stores the entry id. Writing
 * the pair there fails the same validator that requires it when there are
 * several — so the choice is made in one place, from the same list the model
 * declares.
 */
function relationOver(targets: string[]): {
  model: string | string[]
  ref: (entry: { model: string; ref: string }) => string | { model: string; ref: string }
} {
  const single = targets.length === 1
  return { model: single ? targets[0]! : targets, ref: (entry) => (single ? entry.ref : entry) }
}

/** Post, term, user or attachment ids of an ACF reference value: ids, numeric strings or `{ ID }` objects. */
const idsOf = (v: unknown): number[] =>
  (Array.isArray(v) ? v : [v])
    .map((x) => (typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x && typeof x === 'object' ? Number((x as { ID?: unknown; id?: unknown; term_id?: unknown }).ID ?? (x as { id?: unknown }).id ?? (x as { term_id?: unknown }).term_id) : Number.NaN))
    .filter((n) => Number.isSafeInteger(n) && n > 0)

export function rawToContentrain(raw: RawIR, opts?: { updatedBy?: string }): ContentrainResult {
  const updatedBy = opts?.updatedBy ?? '@contentrain/wp-import'
  const locale = normLocale(raw.site.language) || 'en'
  const models: Record<string, ModelDefinition> = {}
  const contents: Record<string, Record<string, Entry>> = {}
  const metas: Record<string, Record<string, Meta>> = {}
  // Per-locale buckets for i18n models (post types on a multilingual site).
  const localeContents: Record<string, Record<string, Record<string, Entry>>> = {}
  const localeMetas: Record<string, Record<string, Record<string, Meta>>> = {}

  // ── languages ──
  // A post's language comes from the plugin (`lang`) or, in WXR, from the
  // `language` taxonomy term Polylang attaches. Posts without one belong to the
  // site's default locale. More than one locale seen → post-type models are
  // i18n and content is written per locale.
  const postLocale = (p: RawPost): string =>
    normLocale(p.lang ?? p.terms.find((t) => t.taxonomy === 'language')?.slug) || locale
  const locales = [locale, ...[...new Set(raw.posts.filter((p) => !SKIP_TYPES.test(p.type)).map(postLocale))].filter((l) => l !== locale).toSorted()]
  const multilingual = locales.length > 1
  // Translation groups → one canonical post per group. Its entry id is shared
  // by every translation, which is how an i18n collection addresses one entry
  // in several locales. The canonical member is the default-locale post when
  // there is one, else the lowest id — deterministic either way.
  const postById = new Map(raw.posts.map((p) => [p.id, p]))
  const canonicalOf = new Map<number, number>()
  let translationGroups = 0
  for (const pair of raw.language_pairs ?? []) {
    const members = [...new Set(Object.values(pair.translations))].filter((id) => postById.has(id) && !SKIP_TYPES.test(postById.get(id)!.type))
    if (members.length < 2) continue
    const memberLocales = members.map((id) => postLocale(postById.get(id)!))
    if (new Set(memberLocales).size !== members.length)
      throw new Error(`Translation group ${pair.post} has multiple posts in the same normalized locale; refusing to overwrite a translation`)
    const canonical = members.find((id) => postLocale(postById.get(id)!) === locale) ?? Math.min(...members)
    for (const id of members) canonicalOf.set(id, canonical)
    translationGroups++
  }
  let siteEntry: Entry = {}
  let siteMeta: Meta | null = null
  const report: ImportReport = {
    slug_rewritten: 0,
    slug_fallback: 0,
    title_fallback: 0,
    meta_fields: {},
    acf_fields: {},
    acf_outside_choices: {},
    skipped_types: [],
    dropped_relations: 0,
    models: {},
    locales,
    translation_groups: translationGroups,
    password_protected_drafts: 0,
    site_title_missing: false,
  }
  const importMeta = (status: string, extra: Partial<Meta> = {}): Meta => ({
    status,
    source: 'import',
    updated_by: updatedBy,
    ...extra,
  })
  const mapStatus = (p: RawPost): Meta => {
    // Checked first: a protected post must never come in published or scheduled.
    if (p.password && p.status !== 'trash') {
      report.password_protected_drafts++
      return importMeta('draft')
    }
    if (p.status === 'future' && (!p.date || !Number.isFinite(Date.parse(p.date))))
      throw new Error(`Scheduled WordPress post ${p.id} has no valid publication date`)
    return p.status === 'publish' || p.status === 'inherit'
      ? importMeta('published')
      : p.status === 'future'
        ? importMeta('published', { publish_at: p.date! })
        : p.status === 'pending'
          ? importMeta('in_review')
          : p.status === 'trash'
            ? importMeta('archived')
            : importMeta('draft')
  }
  const addModel = (m: ModelDefinition): void => {
    models[m.id] = m
    contents[m.id] ??= {}
    metas[m.id] ??= {}
  }

  // ── identities (shared formulas — REST and WXR must agree) ──
  const authorId = (login: string): string => hexId(`authors:${login}`)
  const termId = (tax: string, slug: string): string => hexId(`${tax}:${slug}`)
  const usedSlugs = new Map<string, number>()
  const postSlug = (p: RawPost): string => {
    let s = slugify(decodeSlug(p.slug))
    if (!s) {
      s = `${p.type}-${p.id}`
      report.slug_fallback++
    } else if (s !== p.slug) report.slug_rewritten++
    // Slugs are unique per type — and per locale on a multilingual site, where
    // `/about/` and `/tr/about/` are different entries with the same slug.
    const key = multilingual ? `${p.type}:${postLocale(p)}:${s}` : `${p.type}:${s}`
    const n = usedSlugs.get(key) ?? 0
    usedSlugs.set(key, n + 1)
    return n ? `${s}-${p.id}` : s
  }
  const slugOf = new Map<number, string>()
  const postEntry = new Map<number, { model: string; ref: string }>()
  for (const p of raw.posts.toSorted((a, b) => a.id - b.id)) {
    // Only exported entries may be relation targets or appear in the source map.
    if (SKIP_TYPES.test(p.type)) continue
    slugOf.set(p.id, postSlug(p))
  }
  // Keep established slug identities unless distinct translation groups collide.
  // Prefer the default-locale group, then the lowest WP id, independently of
  // REST pagination/WXR order. A colliding group gets a WP-id namespace.
  const identityOwner = new Map<string, number>()
  const exported = raw.posts.filter((p) => !SKIP_TYPES.test(p.type))
  const canonicalPosts = exported.filter((p) => (canonicalOf.get(p.id) ?? p.id) === p.id)
    .toSorted((a, b) => Number(postLocale(b) === locale) - Number(postLocale(a) === locale) || a.id - b.id)
  for (const p of canonicalPosts) {
    const key = `${typeModelId(p.type)}:${slugOf.get(p.id)!}`
    if (!identityOwner.has(key)) identityOwner.set(key, p.id)
  }
  for (const p of exported) {
    const canonical = canonicalOf.get(p.id) ?? p.id
    const mid = typeModelId(p.type)
    const key = `${mid}:${slugOf.get(canonical) ?? slugOf.get(p.id)!}`
    postEntry.set(p.id, { model: mid, ref: hexId(identityOwner.get(key) === canonical ? key : `${mid}:wp:${canonical}`) })
  }
  const mediaRef = (id: number): string | null => (raw.attachments.some((a) => a.id === id) ? hexId(`media:${id}`) : null)

  // ── ACF references: the store entry each id points at ──
  const termById = new Map(raw.terms.map((t) => [t.id, t]))
  const authorById = new Map(raw.authors.filter((a) => a.id !== null).map((a) => [a.id!, a]))
  const refOf = (kind: AcfReference, id: number): { model: string; ref: string } | null => {
    if (kind === 'post') return postEntry.get(id) ?? null
    if (kind === 'media') { const m = mediaRef(id); return m ? { model: 'media', ref: m } : null }
    if (kind === 'user') { const a = authorById.get(id); return a && models.authors ? { model: 'authors', ref: authorId(slugify(a.login)) } : null }
    if (kind === 'term') { const t = termById.get(id); return t && models[taxModelId(t.taxonomy)] ? { model: taxModelId(t.taxonomy), ref: termId(t.taxonomy, t.slug) } : null }
    return null
  }
  interface AcfFieldPlan { def?: FieldDef; kind?: AcfReference; multiple: boolean; models: Set<string> }
  /** Every ACF field on these posts: its definition, or — for a reference — its kind and target models. */
  const acfPlan = (items: RawPost[], taken: (k: string) => boolean): Map<string, AcfFieldPlan> => {
    const out = new Map<string, AcfFieldPlan>()
    for (const p of items) {
      for (const [k, acf] of Object.entries(p.acf ?? {})) {
        if (taken(k) || acf.value === null || acf.value === undefined || acf.value === '' || acf.value === false && acf.type !== 'true_false') continue
        const kind = acf.type ? ACF_REFERENCE_TYPES[acf.type] : undefined
        if (kind === 'address') {
          const def: FieldDef = Array.isArray(acf.value) ? { type: 'array', items: 'url' } : { type: 'url' }
          const cur = out.get(k)
          out.set(k, { def: cur?.def ?? { ...def, ...(acf.label ? { label: strip(acf.label) } : {}) }, kind, multiple: false, models: new Set() })
          continue
        }
        if (kind) {
          const cur = out.get(k) ?? { kind, multiple: acf.type === 'relationship' || acf.type === 'gallery', models: new Set<string>() }
          if (Array.isArray(acf.value)) cur.multiple = true
          for (const id of idsOf(acf.value)) { const r = refOf(kind, id); if (r) cur.models.add(r.model) }
          out.set(k, cur)
          continue
        }
        const def = acfFieldDef(k, acfScrub(acf.value), { type: acf.type, label: acf.label })
        if (!def) continue
        const cur = out.get(k)
        out.set(k, { def: cur?.def ? mergeFieldDef(cur.def, def) : def, multiple: false, models: new Set() })
      }
    }
    // A reference none of whose targets is in the store has no model to point at: it is left out.
    for (const [k, plan] of out) if (!plan.def && !plan.models.size) out.delete(k)
    return out
  }
  const acfRefs = (plan: AcfFieldPlan, value: unknown): unknown => {
    const refs = idsOf(value).map((id) => refOf(plan.kind!, id)).filter((r): r is { model: string; ref: string } => !!r)
    const missing = idsOf(value).length - refs.length
    if (missing > 0) report.dropped_relations += missing
    if (!refs.length) return undefined
    const poly = plan.models.size > 1
    const one = (r: { model: string; ref: string }) => (poly ? r : r.ref)
    return plan.multiple ? refs.map(one) : one(refs[0]!)
  }
  // page_link: an id is the address of that post as it is now.
  // Only a published, unprotected target's address: a draft's `?page_id=` is no address to keep.
  const addressOf = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(addressOf).filter(Boolean)
    if (typeof v !== 'number') return v
    const t = postById.get(v)
    return t && t.status === 'publish' && !t.password ? (t.link ?? undefined) : undefined
  }
  const titleOf = (p: RawPost): string => {
    const t = strip(p.title)
    if (t) return t
    report.title_fallback++
    return slugOf.get(p.id) ?? `#${p.id}`
  }

  // ── authors ──
  addModel({
    id: 'authors', name: 'Authors', kind: 'collection', domain: 'blog', i18n: false, title_field: 'name',
    fields: {
      name: { type: 'string', required: true, label: 'Name', order: 10 },
      slug: { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
      email: { type: 'email', label: 'Email', order: 30 },
      wp_id: { type: 'integer', label: 'WP user ID', order: 40 },
    },
  })
  for (const a of raw.authors) {
    const id = authorId(slugify(a.login))
    contents.authors![id] = pick(
      { name: strip(a.display_name), slug: slugify(a.login), email: a.email, wp_id: a.id },
      new Set(['name', 'slug', 'email', 'wp_id']),
    )
    metas.authors![id] = importMeta('published')
  }
  for (const p of raw.posts) {
    if (p.author && !contents.authors![authorId(slugify(p.author))]) {
      contents.authors![authorId(slugify(p.author))] = { name: p.author, slug: slugify(p.author) }
      metas.authors![authorId(slugify(p.author))] = importMeta('published')
    }
  }

  // ── taxonomies (nav_menu and post_format excluded; post_format → select field) ──
  const taxonomies = [...new Set(raw.terms.map((t) => t.taxonomy))].filter(
    (t) => t !== 'nav_menu' && t !== 'post_format' && !LANGUAGE_TAXONOMIES.has(t),
  )
  for (const tax of taxonomies) {
    const mid = taxModelId(tax)
    addModel({
      id: mid, name: mid, kind: 'collection', domain: 'blog', i18n: false, title_field: 'name',
      fields: {
        name: { type: 'string', required: true, label: 'Name', order: 10 },
        slug: { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
        description: { type: 'text', label: 'Description', order: 30 },
        parent: { type: 'relation', model: mid, label: 'Parent', order: 40 },
        wp_id: { type: 'integer', label: 'WP term ID', order: 50 },
      },
    })
    for (const t of raw.terms.filter((x) => x.taxonomy === tax)) {
      const id = termId(tax, t.slug)
      contents[mid]![id] = pick(
        {
          name: strip(t.name),
          slug: slugify(decodeSlug(t.slug)) || `term-${t.id}`,
          description: strip(t.description),
          parent: t.parent && t.parent_resolved ? termId(tax, t.parent) : null,
          wp_id: t.id,
        },
        new Set(['name', 'slug', 'description', 'parent', 'wp_id']),
      )
      metas[mid]![id] = importMeta('published')
    }
  }
  // referenced-but-unlisted terms join the pool (marked resolved:false upstream, never dropped)
  for (const p of raw.posts) {
    for (const t of p.terms) {
      if (t.taxonomy === 'nav_menu' || t.taxonomy === 'post_format' || t.resolved) continue
      const mid = taxModelId(t.taxonomy)
      if (!models[mid]) continue
      const id = termId(t.taxonomy, t.slug)
      contents[mid]![id] ??= { name: strip(t.name), slug: slugify(t.slug) }
      metas[mid]![id] ??= importMeta('published')
    }
  }

  const postTypes = [...new Set(raw.posts.map((p) => p.type))].filter((t) => {
    if (SKIP_TYPES.test(t)) {
      report.skipped_types.push(t)
      return false
    }
    return true
  })
  const contentModelIds = postTypes.map(typeModelId)
  const toContent = relationOver(contentModelIds)

  // ── media ──
  addModel({
    id: 'media', name: 'Media', kind: 'collection', domain: 'assets', i18n: false, title_field: 'title',
    fields: {
      title: { type: 'string', required: true, label: 'Title', order: 10 },
      slug: { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
      url: { type: 'url', required: true, label: 'Source URL', order: 30 },
      alt: { type: 'string', label: 'Alt text', order: 40 },
      caption: { type: 'text', label: 'Caption', order: 50 },
      description: { type: 'text', label: 'Description', order: 60 },
      mime: { type: 'string', label: 'MIME type', order: 70 },
      width: { type: 'integer', label: 'Width', order: 80 },
      height: { type: 'integer', label: 'Height', order: 90 },
      file: { type: 'string', label: 'Upload path', order: 100 },
      parent: { type: 'relation', model: toContent.model, label: 'Attached to', order: 110 },
      wp_id: { type: 'integer', label: 'WP attachment ID', order: 120 },
      uploaded_at: { type: 'datetime', label: 'Uploaded at', order: 130 },
    },
  })
  const mediaSlugs = new Set<string>()
  for (const a of raw.attachments) {
    const id = hexId(`media:${a.id}`)
    let slug = slugify(decodeSlug(a.slug)) || `media-${a.id}`
    if (mediaSlugs.has(slug)) slug = `${slug}-${a.id}`
    mediaSlugs.add(slug)
    const target = a.parent ? postEntry.get(a.parent) : undefined
    if (a.parent && !target) report.dropped_relations++
    const parent = target ? toContent.ref(target) : null
    const im = (a.image_meta ?? null) as { width?: number; height?: number } | null
    contents.media![id] = pick(
      {
        title: strip(a.title) || slug,
        slug,
        url: a.url,
        alt: strip(a.alt),
        caption: strip(a.caption),
        description: strip(a.description),
        mime: a.mime,
        width: im?.width,
        height: im?.height,
        file: a.file,
        parent,
        wp_id: a.id,
        uploaded_at: a.date,
      },
      new Set(['title', 'slug', 'url', 'alt', 'caption', 'description', 'mime', 'width', 'height', 'file', 'parent', 'wp_id', 'uploaded_at']),
    )
    metas.media![id] = importMeta('published')
  }

  // ── post types (post, page, CPTs) ──
  for (const type of postTypes) {
    const typeItems = raw.posts.filter((p) => p.type === type)
    const mid = typeModelId(type)
    const taxes = [...new Set(typeItems.flatMap((p) => p.terms.map((t) => t.taxonomy)))].filter((t) => models[taxModelId(t)])
    const { fields, order } = coreFields({
      excerpt: typeItems.some((p) => p.excerpt),
      body: typeItems.some((p) => p.content),
      date: typeItems.some((p) => p.date),
      author: typeItems.some((p) => p.author),
      taxes,
      cover: typeItems.some((p) => p.meta._thumbnail_id),
    })
    let o = order
    fields.wp_id = { type: 'integer', required: true, unique: true, label: 'WP post ID', order: (o += 10) }
    fields.modified_at = { type: 'datetime', label: 'Modified at', order: (o += 10) }
    fields.link = { type: 'url', label: 'Original permalink', order: (o += 10) }
    const parentModels = [...new Set(typeItems.flatMap((p) => {
      const parent = p.parent ? postEntry.get(p.parent) : undefined
      return parent ? [parent.model] : []
    }))].toSorted()
    if (typeItems.some((p) => p.parent)) fields.parent = {
      type: 'relation',
      model: parentModels.length > 1 ? parentModels : (parentModels[0] ?? mid),
      label: 'Parent', order: (o += 10),
    }
    if (typeItems.some((p) => p.menu_order)) fields.menu_order = { type: 'integer', label: 'Menu order', order: (o += 10) }
    if (typeItems.some((p) => p.sticky)) fields.sticky = { type: 'boolean', label: 'Sticky', order: (o += 10) }
    if (typeItems.some((p) => typeof p.meta._wp_page_template === 'string' && p.meta._wp_page_template !== 'default'))
      fields.template = { type: 'string', label: 'Page template', order: (o += 10) }
    const formats = [
      ...new Set(
        typeItems.flatMap((p) =>
          p.terms.filter((t) => t.taxonomy === 'post_format').map((t) => t.slug.replace(/^post-format-/, '')),
        ),
      ),
    ].toSorted()
    if (formats.length) fields.format = { type: 'select', options: formats, label: 'Post format', order: (o += 10) }
    if (typeItems.some((p) => p.status === 'private' || p.password))
      fields.visibility = { type: 'select', options: ['public', 'private', 'password'], label: 'Visibility', order: (o += 10) }
    if (typeItems.some((p) => p.comment_status))
      fields.comments_open = { type: 'boolean', label: 'Comments open', order: (o += 10) }
    for (const p of typeItems) {
      for (const [k, v] of Object.entries(p.meta)) {
        if (k.startsWith('_') || fields[k] || PLUGIN_META.test(k) || k === 'enclosure') continue
        const t = byValue(v)
        if (t && t !== 'object') {
          fields[k] = { type: t as FieldDef['type'], label: k, order: (o += 10) }
          report.meta_fields[k] = t
        }
      }
    }
    // ACF: one field per ACF field, typed by the mapping table (acf.ts); references resolved to store entries.
    const acfFields = acfPlan(typeItems, (k) => !!fields[k])
    for (const [k, plan] of acfFields) {
      const def = plan.def ?? { type: plan.multiple ? 'relations' : 'relation', model: plan.models.size > 1 ? [...plan.models].toSorted() : [...plan.models][0]! } as FieldDef
      fields[k] = { ...def, ...(def.label ? {} : { label: k }), description: def.description ?? 'ACF', order: (o += 10) }
      report.acf_fields[k] = plan.def ? plan.def.type : `${def.type}:${[...plan.models].toSorted().join('|')}`
    }
    // The locales this type actually has content in. A partially-translated
    // site — pages in one language, posts in three — used to fail validation on
    // every untranslated entry, because parity was checked against the whole
    // project list. Declaring the real coverage says so once, in the model.
    //
    // The default locale is always in: it is the site's source of truth, and a
    // post that carries no language tag belongs to it (`postLocale`), so its
    // absence here would be the importer's uncertainty, not a fact about the
    // site. Full coverage writes nothing — absent already means "all", and a
    // redundant list would then have to be maintained as locales are added.
    const covered = locales.filter(l => l === locale || typeItems.some((p) => postLocale(p) === l))
    addModel({
      id: mid,
      name: type === 'post' ? 'Posts' : type === 'page' ? 'Pages' : mid,
      kind: 'collection',
      domain: domainOf(type),
      i18n: multilingual,
      ...(multilingual && covered.length < locales.length ? { locales: covered } : {}),
      title_field: 'title',
      fields,
    })
    for (const p of typeItems) {
      const id = postEntry.get(p.id)!.ref
      const loc = postLocale(p)
      const contentBucket = multilingual ? ((localeContents[mid] ??= {})[loc] ??= {}) : contents[mid]!
      const metaBucket = multilingual ? ((localeMetas[mid] ??= {})[loc] ??= {}) : metas[mid]!
      const e: Entry = { title: titleOf(p), slug: slugOf.get(p.id), wp_id: p.id }
      if (fields.excerpt) e.excerpt = strip(p.excerpt)
      if (fields.body) e.body = p.content // Gutenberg comments and shortcodes verbatim (known gap)
      if (fields.published_at && p.date) e.published_at = p.date
      if (p.modified) e.modified_at = p.modified
      if (p.link) e.link = p.link
      if (fields.author && p.author) e.author = authorId(slugify(p.author))
      for (const t of taxes) {
        e[taxModelId(t)] = p.terms
          .filter((x) => x.taxonomy === t && contents[taxModelId(t)]![termId(t, x.slug)])
          .map((x) => termId(t, x.slug))
      }
      if (fields.cover && p.meta._thumbnail_id) {
        const m = mediaRef(Number(p.meta._thumbnail_id))
        if (m) e.cover = m
        else report.dropped_relations++
      }
      if (fields.parent && p.parent) {
        const pe = postEntry.get(p.parent)
        if (pe) e.parent = parentModels.length > 1 ? pe : pe.ref
        else report.dropped_relations++
      }
      if (fields.menu_order && p.menu_order) e.menu_order = p.menu_order
      if (fields.sticky) e.sticky = p.sticky ?? false
      if (fields.template && typeof p.meta._wp_page_template === 'string' && p.meta._wp_page_template !== 'default')
        e.template = p.meta._wp_page_template
      if (fields.format) {
        const f = p.terms.find((t) => t.taxonomy === 'post_format')
        if (f) e.format = f.slug.replace(/^post-format-/, '')
      }
      if (fields.visibility) e.visibility = p.password ? 'password' : p.status === 'private' ? 'private' : 'public'
      if (fields.comments_open) e.comments_open = p.comment_status === 'open'
      for (const k of Object.keys(fields)) if (k in p.meta && !(k in e) && !k.startsWith('_')) e[k] = p.meta[k]
      for (const [k, acf] of Object.entries(p.acf ?? {})) {
        const plan = acfFields.get(k)
        if (!plan || k in e) continue
        const outside = () => { report.acf_outside_choices[k] = (report.acf_outside_choices[k] ?? 0) + 1 }
        const v = plan.def ? acfValue(plan.def, plan.kind === 'address' ? addressOf(acf.value) : acfRows(acfScrub(acf.value)), outside) : acfRefs(plan, acf.value)
        if (v !== undefined) e[k] = v
      }
      contentBucket[id] = e
      metaBucket[id] = mapStatus(p)
    }
  }

  // ── menus ──
  const menus = raw.menus ?? []
  if (menus.length) {
    addModel({
      id: 'menus', name: 'Menus', kind: 'collection', domain: 'site', i18n: false, title_field: 'name',
      fields: {
        name: { type: 'string', required: true, label: 'Name', order: 10 },
        slug: { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
        items: { type: 'relations', model: 'menu-items', label: 'Items', order: 30 },
        wp_id: { type: 'integer', label: 'WP term ID', order: 40 },
        // Only when the source said where its menus are shown: stores from sources that do not know stay as they were.
        ...(menus.some((m) => m.locations?.length) ? { locations: { type: 'array', items: 'string', label: 'Locations', order: 50 } as FieldDef } : {}),
      },
    })
    const toTarget = relationOver([...contentModelIds, ...taxonomies.map(taxModelId)])
    addModel({
      id: 'menu-items', name: 'Menu items', kind: 'collection', domain: 'site', i18n: false, title_field: 'title',
      fields: {
        title: { type: 'string', required: true, label: 'Label', order: 10 },
        menu: { type: 'relation', model: 'menus', required: true, label: 'Menu', order: 20 },
        order: { type: 'integer', label: 'Order', order: 30 },
        parent: { type: 'relation', model: 'menu-items', label: 'Parent item', order: 40 },
        type: { type: 'select', options: ['custom', 'post_type', 'taxonomy', 'post_type_archive'], label: 'Type', order: 50 },
        url: { type: 'url', label: 'URL', order: 60 },
        target: { type: 'relation', model: toTarget.model, label: 'Target', order: 70 },
        open_in_new_tab: { type: 'boolean', label: 'Open in new tab', order: 80 },
        classes: { type: 'array', items: 'string', label: 'CSS classes', order: 90 },
        description: { type: 'text', label: 'Description', order: 100 },
        wp_id: { type: 'integer', label: 'WP post ID', order: 110 },
      },
    })
    const itemRef = (id: number): string => hexId(`menu-items:${id}`)
    for (const m of menus) {
      const mid = hexId(`menus:${m.slug}`)
      contents.menus![mid] = {
        name: strip(m.name),
        slug: slugify(m.slug) || `menu-${m.id}`,
        items: m.items.map((i) => itemRef(i.id)),
        wp_id: m.id,
        ...(m.locations?.length ? { locations: m.locations } : {}),
      }
      metas.menus![mid] = importMeta('published')
      for (const i of m.items) {
        const e: Entry = {
          title: strip(i.title) || i.url || `item-${i.id}`,
          menu: mid,
          order: i.order,
          type: i.target.kind === 'url' ? 'custom' : i.target.kind === 'post' ? 'post_type' : i.target.kind === 'term' ? 'taxonomy' : i.target.kind === 'archive' ? 'post_type_archive' : 'custom',
          // A block navigation's items have no WordPress id (negative placeholders): none is claimed.
          ...(i.id > 0 ? { wp_id: i.id } : {}),
          open_in_new_tab: i.target_attr === '_blank',
        }
        if (i.parent && !i.parent_unresolved) e.parent = itemRef(i.parent)
        if (i.target.kind === 'url' && i.url) e.url = i.url
        if (i.target.kind === 'post' && i.target.resolved && i.target.id != null) {
          const pe = postEntry.get(i.target.id)
          if (pe) e.target = toTarget.ref(pe)
          else report.dropped_relations++
        }
        if (i.target.kind === 'term' && i.target.resolved && i.target.slug && models[taxModelId(i.target.taxonomy)])
          e.target = toTarget.ref({ model: taxModelId(i.target.taxonomy), ref: termId(i.target.taxonomy, i.target.slug) })
        if (i.classes?.length) e.classes = i.classes
        if (i.description) e.description = strip(i.description)
        contents['menu-items']![itemRef(i.id)] = e
        metas['menu-items']![itemRef(i.id)] = importMeta(i.status === 'publish' ? 'published' : 'draft')
      }
    }
  }

  // ── comments (frozen archive collection; the live-service path is CommentsExport) ──
  const comments = raw.comments ?? []
  if (comments.length) {
    addModel({
      id: 'comments', name: 'Comments', kind: 'collection', domain: 'blog', i18n: false, title_field: 'author',
      fields: {
        author: { type: 'string', required: true, label: 'Author', order: 10 },
        email: { type: 'email', label: 'Email', order: 20 },
        url: { type: 'url', label: 'Website', order: 30 },
        body: { type: 'richtext', label: 'Body', order: 40 },
        published_at: { type: 'datetime', label: 'Date', order: 50 },
        post: { type: 'relation', model: toContent.model, required: true, label: 'Post', order: 60 },
        parent: { type: 'relation', model: 'comments', label: 'In reply to', order: 70 },
        type: { type: 'string', label: 'Type', order: 80 },
        user: { type: 'relation', model: 'authors', label: 'User', order: 90 },
        wp_id: { type: 'integer', label: 'WP comment ID', order: 100 },
      },
    })
    const cRef = (id: number): string => hexId(`comments:${id}`)
    const userById = new Map(raw.authors.filter((a) => a.id != null).map((a) => [a.id, authorId(slugify(a.login))]))
    for (const c of comments) {
      const post = postEntry.get(c.post)
      if (!post) {
        report.dropped_relations++
        continue
      }
      contents.comments![cRef(c.id)] = pick(
        {
          author: strip(c.author) || 'anonymous',
          email: c.email,
          url: c.url,
          body: c.content,
          published_at: c.date,
          post: toContent.ref(post),
          parent: c.parent && c.parent_resolved ? cRef(c.parent) : null,
          type: c.type,
          user: c.user_id ? userById.get(c.user_id) : null,
          wp_id: c.id,
        },
        new Set(['author', 'email', 'url', 'body', 'published_at', 'post', 'parent', 'type', 'user', 'wp_id']),
      )
      metas.comments![cRef(c.id)] = importMeta(
        c.approved === '1' ? 'published' : c.approved === 'spam' || c.approved === 'trash' ? 'archived' : 'in_review',
      )
    }
  }

  // ── site singleton + vocabulary ──
  addModel({
    id: 'site', name: 'Site', kind: 'singleton', domain: 'site', i18n: false, title_field: 'title',
    fields: {
      title: { type: 'string', required: true, label: 'Site title', order: 10 },
      tagline: { type: 'string', label: 'Tagline', order: 20 },
      url: { type: 'url', label: 'URL', order: 30 },
      language: { type: 'string', label: 'Language', order: 40 },
    },
  })
  siteEntry = pick(
    { title: strip(raw.site.title), tagline: raw.site.description, url: raw.site.url, language: raw.site.language },
    new Set(['title', 'tagline', 'url', 'language']),
  )
  siteMeta = importMeta('published')
  report.site_title_missing = !siteEntry.title
  const vocabTerms: Record<string, Record<string, string>> = {}
  for (const m of menus) {
    for (const i of m.items) {
      const k = slugify(strip(i.title))
      if (k && !vocabTerms[k]) vocabTerms[k] = { [locale]: strip(i.title) }
    }
  }

  // ── file map (canonical serialization; PATH_PATTERNS layout) ──
  const files: Record<string, string> = {}
  const domains = [...new Set(Object.values(models).map((m) => m.domain))].toSorted()
  for (const m of Object.values(models)) {
    files[`.contentrain/models/${m.id}.json`] = canon(m)
    if (m.i18n) {
      // One content + meta file per locale; an entry id recurs across the
      // locales it has a translation in.
      const perLocale = localeContents[m.id] ?? {}
      const ids = new Set<string>()
      for (const loc of Object.keys(perLocale).toSorted()) {
        files[`.contentrain/content/${m.domain}/${m.id}/${loc}.json`] = canon(perLocale[loc])
        files[`.contentrain/meta/${m.id}/${loc}.json`] = canon(localeMetas[m.id]?.[loc] ?? {})
        for (const id of Object.keys(perLocale[loc]!)) ids.add(id)
      }
      report.models[m.id] = { kind: m.kind, domain: m.domain, fields: Object.keys(m.fields ?? {}).length, entries: ids.size }
      continue
    }
    const content = m.kind === 'singleton' ? siteEntry : contents[m.id]!
    const meta = m.kind === 'singleton' ? siteMeta : metas[m.id]!
    files[`.contentrain/content/${m.domain}/${m.id}/data.json`] = canon(content)
    files[`.contentrain/meta/${m.id}/${locale}.json`] = canon(meta)
    report.models[m.id] = {
      kind: m.kind,
      domain: m.domain,
      fields: Object.keys(m.fields ?? {}).length,
      entries: m.kind === 'singleton' ? 1 : Object.keys(contents[m.id]!).length,
    }
  }
  files['.contentrain/config.json'] = canon({
    version: 1,
    stack: 'astro',
    platform: 'web',
    workflow: 'review',
    locales: { default: locale, supported: locales },
    domains,
  })
  files['.contentrain/vocabulary.json'] = canon({ version: 1, terms: vocabTerms })

  const entrySourceMap: EntrySourceMap = {}
  for (const [wpId, ref] of postEntry) {
    entrySourceMap[String(wpId)] = { model_id: ref.model, entry_id: ref.ref, locale: postLocale(postById.get(wpId)!) }
  }

  files['import-report.json'] = canon(report)
  return { files, entry_source_map: entrySourceMap, report }
}
