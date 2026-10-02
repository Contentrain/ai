// Custom post types (a project, a team member): their entries, addresses and cards. The collections are the
// project's own, so they are read by the names siteConfig.types carries, as data of unknown shape — the route
// table, the single page and the lists never name a field themselves.

import { getCollection, getEntry, type CollectionKey } from 'astro:content'
import type { ImageInput } from '../components/kit/_shared/types'
import type { CustomType } from '../site.config'
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

/** Newest first, as WordPress lists a post type; entries without a date keep their title order after the dated ones. */
export function newestFirst(entries: readonly TypeEntry[], dateField = 'published_at'): TypeEntry[] {
  return entries.toSorted((a, b) => (dateOf(b.data[dateField])?.getTime() ?? 0) - (dateOf(a.data[dateField])?.getTime() ?? 0)
    || (text(a.data.title) ?? text(a.data.name) ?? a.id).localeCompare(text(b.data.title) ?? text(b.data.name) ?? b.id))
}

export function entryHref(type: CustomType, entry: TypeEntry): string {
  const slug = text(entry.data.slug) ?? entry.id
  const wpId = entry.data.wp_id
  return fillPattern(type.single, { slug, id: typeof wpId === 'number' ? String(wpId) : entry.id, ...dateParams(dateOf(entry.data.published_at)) })
}

export function termHref(taxonomy: Taxonomy, term: TypeEntry): string {
  return fillPattern(taxonomy.pattern, { slug: text(term.data.slug) ?? term.id })
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
    date: card.date ? dateOf(entry.data[card.date]) : undefined,
    image: media ? imageOf(media as Media) : undefined,
    category: taxonomy && term ? { label: text(term.data.name) ?? term.id, href: termHref(taxonomy, term) } : undefined,
  }
}
