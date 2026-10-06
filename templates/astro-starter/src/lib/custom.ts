// Custom post types (a project, a team member): their entries, addresses and cards. The collections are the
// project's own, so they are read by the names siteConfig.types carries, as data of unknown shape — the route
// table, the single page and the lists never name a field themselves.

import { getCollection, getEntry, type CollectionKey } from 'astro:content'
import type { ImageInput } from '../components/kit/_shared/types'
import { siteConfig, type CustomType } from '../site.config'
import { imageOf, type Media } from './content'
import { dateParams, fillPattern } from './routes'

export type TypeEntry = { id: string, data: Record<string, unknown> }
export type Taxonomy = NonNullable<CustomType['taxonomies']>[number]

export const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined)

export const dateOf = (value: unknown): Date | undefined => (value instanceof Date ? value : undefined)

/** The entries of a collection named by configuration; the content layer validated them against the project's schema. */
export async function entriesOf(collection: string): Promise<TypeEntry[]> {
  const entries = await getCollection(collection as CollectionKey)
  return entries.map(entry => ({ id: entry.id, data: entry.data as Record<string, unknown> }))
}

/** One entry of a collection named by configuration; undefined when it is not there (a draft is not: the loader holds published entries only). */
export async function entryById(collection: string, id: string): Promise<TypeEntry | undefined> {
  const entry = await getEntry(collection as CollectionKey, id)
  return entry ? { id: entry.id, data: entry.data as Record<string, unknown> } : undefined
}

const wordpressId = (entry: TypeEntry) => typeof entry.data.wp_id === 'number' ? entry.data.wp_id : 0

/**
 * Newest first, as WordPress lists a post type: entries of the same moment the higher ID first, as WordPress orders
 * them; entries without a date keep their title order after the dated ones.
 */
export function newestFirst(entries: readonly TypeEntry[], dateField = 'published_at'): TypeEntry[] {
  const tie = siteConfig.lists.tieOrder === 'asc' ? -1 : 1
  return entries.toSorted((a, b) => (dateOf(b.data[dateField])?.getTime() ?? 0) - (dateOf(a.data[dateField])?.getTime() ?? 0)
    || tie * (wordpressId(b) - wordpressId(a))
    || (text(a.data.title) ?? text(a.data.name) ?? a.id).localeCompare(text(b.data.title) ?? text(b.data.name) ?? b.id))
}

export function entryHref(type: CustomType, entry: TypeEntry): string {
  const slug = text(entry.data.slug) ?? entry.id
  const wpId = entry.data.wp_id
  return fillPattern(type.single, { slug, id: typeof wpId === 'number' ? String(wpId) : entry.id, ...dateParams(dateOf(entry.data.published_at)) })
}

/** A taxonomy's terms by `collection:id`, the key `termHref` reads a term's parents under. */
export const termsById = (collection: string, terms: readonly TypeEntry[]): Map<string, TypeEntry> => new Map(terms.map(term => [`${collection}:${term.id}`, term]))

/**
 * A term's address. A taxonomy whose terms nest serves a child at `/<base>/<parent>/<child>/` (WordPress, a hierarchical
 * taxonomy): its pattern carries `:path`, filled from the term's `parent` chain in `terms` (by `collection:id`), as a
 * category's is. Without `:path` the slug alone.
 */
export function termHref(taxonomy: Taxonomy, term: TypeEntry, terms?: ReadonlyMap<string, TypeEntry>): string {
  const slug = text(term.data.slug) ?? term.id
  if (!taxonomy.pattern.includes(':path')) return fillPattern(taxonomy.pattern, { slug })
  const trail: string[] = []
  const seen = new Set<string>()
  for (let at: TypeEntry | undefined = term; at && !seen.has(at.id); at = terms?.get(`${taxonomy.collection}:${refIds(at.data.parent)[0] ?? ''}`)) {
    seen.add(at.id)
    trail.unshift(text(at.data.slug) ?? at.id)
  }
  return fillPattern(taxonomy.pattern, { slug, path: trail.join('/') })
}

/** The ids a `relations` (or `relation`) value points at. */
export function refIds(value: unknown): string[] {
  const refs = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return refs.flatMap(ref => (typeof ref === 'object' && ref !== null && 'id' in ref && typeof ref.id === 'string' ? [ref.id] : []))
}

export const entryTitle = (type: CustomType, entry: TypeEntry): string => text(entry.data[type.card.title]) ?? entry.id

/** The entry's body as rich text, when the type has one. */
export const bodyOf = (type: CustomType, entry: TypeEntry): string | undefined => (type.body ? text(entry.data[type.body]) : undefined)

/** What a card of a post-card list shows. */
export interface Card {
  title: string
  href: string
  excerpt?: string | undefined
  /** The entry's rich-text body, for a list that shows each entry in full. */
  body?: string | undefined
  date?: Date | undefined
  image?: ImageInput | undefined
  category?: { label: string, href: string } | undefined
}

/** The entry as a card: the type's own field names say which field is the excerpt, the image and the date. */
export async function entryCard(type: CustomType, entry: TypeEntry, terms: ReadonlyMap<string, TypeEntry>): Promise<Card> {
  const { card } = type
  const [imageId] = card.image ? refIds(entry.data[card.image]) : []
  const media = imageId ? await getEntry('media', imageId) : undefined
  const taxonomy = type.taxonomies?.[0]
  const term = taxonomy ? terms.get(`${taxonomy.collection}:${refIds(entry.data[taxonomy.field])[0] ?? ''}`) : undefined
  return {
    title: entryTitle(type, entry),
    href: entryHref(type, entry),
    excerpt: card.excerpt ? text(entry.data[card.excerpt]) : undefined,
    body: bodyOf(type, entry),
    date: card.date ? dateOf(entry.data[card.date]) : undefined,
    image: media ? imageOf(media as Media) : undefined,
    category: taxonomy && term ? { label: text(term.data.name) ?? term.id, href: termHref(taxonomy, term, terms) } : undefined,
  }
}
