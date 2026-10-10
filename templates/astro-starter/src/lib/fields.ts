// The typed field list of a custom post type's single page: each field of siteConfig.types[].fields, in schema
// order, as something to print — never a key, never an empty or false value. A field whose value cannot be
// shown as its type says prints nothing rather than a guess.

import { getEntry, type CollectionKey } from 'astro:content'
import type { ImageInput } from '../components/kit/_shared/types'
import type { CustomField, CustomType } from '../site.config'
import { entryHref, refIds, termHref, termsById, text, type TypeEntry } from './custom'
import { imageOf, type Media } from './content'
import { servedPath } from './base'

export type Shown =
  | { kind: 'text', text: string }
  | { kind: 'link', text: string, href: string, download?: true }
  | { kind: 'time', value: Date, dateOnly: boolean }
  | { kind: 'html', html: string }
  | { kind: 'image', image: ImageInput }
  | { kind: 'list', items: Shown[], markup?: 'ol' | 'details' }
  | { kind: 'group', rows: ShownField[] }

export interface ShownField {
  label: string
  value: Shown
  /** Print the value without its label. */
  hideLabel?: true
}

const LINKED = new Set(['url', 'email', 'phone'])
/** Only addresses a visitor can follow safely become links: http(s) and site paths; `javascript:` or `data:` stay text. */
const safeHref = (value: string): string | undefined => (/^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value) ? value : undefined)
/** A site path as the site serves it: in its directory under a `base` (`/files/a.pdf` → `/blog/files/a.pdf`). */
const served = (href: string): string => (href.startsWith('/') ? servedPath(href) : href)

/** The file's own name with its extension, from the last path segment of its address. */
const fileName = (href: string): string => {
  const last = href.split(/[?#]/)[0]!.split('/').findLast(Boolean) ?? href
  try { return decodeURIComponent(last) } catch { return last }
}

function linked(type: string, value: string): Shown {
  const safe = type === 'email' || type === 'phone' ? undefined : safeHref(value)
  const href = type === 'email' ? `mailto:${value}` : type === 'phone' ? `tel:${value.replace(/[^\d+]/g, '')}` : safe && served(safe)
  return href ? { kind: 'link', text: value, href } : { kind: 'text', text: value }
}

/** Where each custom entry and term lives, by `collection:id`, for relations between them. */
export type Targets = ReadonlyMap<string, { href: string, title: string }>

export function targetsOf(types: readonly CustomType[], entries: ReadonlyMap<string, readonly TypeEntry[]>): Targets {
  const out = new Map<string, { href: string, title: string }>()
  const titleOf = (entry: TypeEntry, field: string) => text(entry.data[field]) ?? text(entry.data.name) ?? entry.id
  for (const type of types) {
    for (const entry of entries.get(type.collection) ?? []) out.set(`${type.collection}:${entry.id}`, { href: entryHref(type, entry), title: titleOf(entry, type.card.title) })
    for (const taxonomy of type.taxonomies ?? []) {
      const terms = termsById(taxonomy.collection, entries.get(taxonomy.collection) ?? [])
      for (const term of terms.values()) out.set(`${taxonomy.collection}:${term.id}`, { href: termHref(taxonomy, term, terms), title: titleOf(term, 'name') })
    }
  }
  return out
}

async function show(field: CustomField, value: unknown, targets: Targets, depth: number): Promise<Shown | undefined> {
  if (value === undefined || value === null || value === false || value === '' || (Array.isArray(value) && value.length === 0)) return undefined
  const { type } = field
  if (type === 'relation' || type === 'relations') {
    const ids = refIds(value)
    const shown = (await Promise.all(ids.map(async (id): Promise<Shown | undefined> => {
      if (field.collection === 'media') {
        const media = await getEntry('media', id)
        return media ? { kind: 'image', image: imageOf(media as Media) } : undefined
      }
      const target = field.collection ? targets.get(`${field.collection}:${id}`) : undefined
      if (target) return { kind: 'link', text: target.title, href: target.href }
      const entry = field.collection ? await getEntry(field.collection as CollectionKey, id) : undefined
      const data = entry?.data as Record<string, unknown> | undefined
      const title = text(data?.title) ?? text(data?.name)
      return title ? { kind: 'text', text: title } : undefined
    }))).filter((item): item is Shown => item !== undefined)
    if (shown.length === 0) return undefined
    return type === 'relation' || shown.length === 1 ? shown[0] : { kind: 'list', items: shown }
  }
  if (type === 'richtext' || type === 'markdown') return typeof value === 'string' ? { kind: 'html', html: value } : undefined
  if (type === 'date' || type === 'datetime') return value instanceof Date ? { kind: 'time', value, dateOnly: type === 'date' } : undefined
  // The label is the row's term; a true value is its mark.
  if (type === 'boolean') return value === true ? { kind: 'text', text: '✓' } : undefined
  if (type === 'object' && depth < 2) {
    const rows = await shownFields(field.fields ?? [], value as Record<string, unknown>, targets, depth + 1)
    return rows.length > 0 ? { kind: 'group', rows } : undefined
  }
  if (type === 'array' && Array.isArray(value)) {
    if (field.fields && depth < 2) {
      const groups = (await Promise.all(value.map(async row => (typeof row === 'object' && row !== null ? { kind: 'group' as const, rows: await shownFields(field.fields ?? [], row as Record<string, unknown>, targets, depth + 1) } : undefined))))
        .filter((group): group is Extract<Shown, { kind: 'group' }> => group !== undefined && group.rows.length > 0)
      return groups.length > 0 ? { kind: 'list', items: groups, ...(field.markup ? { markup: field.markup } : {}) } : undefined
    }
    const items = (await Promise.all(value.map(item => show({ name: field.name, label: field.label, type: field.of ?? 'string' }, item, targets, depth + 1)))).filter((item): item is Shown => item !== undefined)
    return items.length > 0 ? { kind: 'list', items, ...(field.markup === 'ol' ? { markup: 'ol' as const } : {}) } : undefined
  }
  if (typeof value === 'number') return { kind: 'text', text: String(value) }
  const str = text(value)
  if (!str) return undefined
  // An address a migration stored for an image or file field; anything that is not a safe address stays text.
  if (type === 'image' || type === 'file') {
    const src = safeHref(str)
    if (src && type === 'image') return { kind: 'image', image: { src, alt: field.label } }
    if (src) return { kind: 'link', text: fileName(src), href: served(src), download: true }
  }
  return LINKED.has(type) ? linked(type, str) : { kind: 'text', text: str }
}

export async function shownFields(fields: readonly CustomField[], data: Record<string, unknown>, targets: Targets, depth = 0): Promise<ShownField[]> {
  const shown = await Promise.all(fields.map(async field => ({ field, value: await show(field, data[field.name], targets, depth) })))
  return shown.flatMap(({ field, value }) => (value ? [{ label: field.label, value, ...(field.hideLabel ? { hideLabel: true as const } : {}) }] : []))
}
