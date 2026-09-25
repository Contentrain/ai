// Queries the pages share. Everything here reads the content layer, which the
// Contentrain loader fills from `.contentrain` — no page reads files itself.

import { getCollection, getEntry, type CollectionEntry, type CollectionKey } from 'astro:content'
import type { ImageInput, NavItem } from '../components/kit/_shared/types'
import { siteConfig } from '../site.config'
import { dateParams, fillPattern, permalinks } from './routes'

export type Post = CollectionEntry<'posts'>
export type Page = CollectionEntry<'pages'>
export type Term = CollectionEntry<'categories'> | CollectionEntry<'tags'>
export type Author = CollectionEntry<'authors'>
export type Media = CollectionEntry<'media'>

export async function getSite(): Promise<CollectionEntry<'site'>['data']> {
  const site = await getEntry('site', 'site')
  if (!site) throw new Error('The site singleton (.contentrain/content/site/site/data.json) is missing.')
  return site.data
}

/** Newest first; sticky posts lead, as on a WordPress front page. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts')
  return posts.toSorted((a, b) =>
    Number(b.data.sticky) - Number(a.data.sticky)
    || (b.data.published_at?.getTime() ?? 0) - (a.data.published_at?.getTime() ?? 0)
    || a.data.title.localeCompare(b.data.title))
}

export function postHref(post: Post): string {
  return fillPattern(permalinks.post, { slug: post.data.slug, id: String(post.data.wp_id ?? post.id), ...dateParams(post.data.published_at) })
}

/** A page's address carries its parents: `about/team`. */
export function pageHref(page: Page, pages: ReadonlyMap<string, Page>): string {
  if (siteConfig.home.kind === 'page' && siteConfig.home.slug === page.data.slug) return '/'
  const trail: string[] = []
  const seen = new Set<string>()
  for (let at: Page | undefined = page; at && !seen.has(at.id); at = at.data.parent ? pages.get(at.data.parent.id) : undefined) {
    seen.add(at.id)
    trail.unshift(at.data.slug)
  }
  return fillPattern(permalinks.page, { slug: page.data.slug, path: trail.join('/') })
}

export function termHref(kind: 'category' | 'tag', term: Term, terms: ReadonlyMap<string, Term>): string {
  const trail: string[] = []
  const seen = new Set<string>()
  for (let at: Term | undefined = term; at && !seen.has(at.id); at = at.data.parent ? terms.get(at.data.parent.id) : undefined) {
    seen.add(at.id)
    trail.unshift(at.data.slug)
  }
  return fillPattern(permalinks[kind], { slug: term.data.slug, path: trail.join('/') })
}

export function authorHref(author: Author): string {
  return fillPattern(permalinks.author, { slug: author.data.slug })
}

export async function byId<C extends 'pages' | 'categories' | 'tags' | 'authors' | 'media'>(collection: C): Promise<Map<string, CollectionEntry<C>>> {
  const entries = await getCollection(collection)
  return new Map(entries.map(entry => [entry.id, entry]))
}

/** Resolve references, dropping ones whose target was deleted or is unpublished. */
export async function resolve<C extends CollectionKey>(refs: ReadonlyArray<{ collection: C, id: string }>): Promise<Array<CollectionEntry<C>>> {
  const entries = await Promise.all(refs.map(ref => getEntry(ref.collection, ref.id)))
  return entries.filter(entry => entry !== undefined) as Array<CollectionEntry<C>>
}

/** A media entry as the kit's image input. */
export function imageOf(media: Media): ImageInput {
  const { url, alt = '', width, height } = media.data
  return { src: url, alt, width, height }
}

/** A menu as a tree, ordered as the editor ordered it. An unknown menu is empty. */
export async function getMenu(slug: string): Promise<NavItem[]> {
  const menus = await getCollection('menus', menu => menu.data.slug === slug)
  const menu = menus[0]
  if (!menu) return []
  const items = await resolve(menu.data.items)
  const sorted = items.toSorted((a, b) => a.data.order - b.data.order)
  const link = (item: CollectionEntry<'menuItems'>): NavItem => ({
    label: item.data.title,
    href: item.data.url ?? '/',
    newTab: item.data.open_in_new_tab,
    children: sorted.filter(child => child.data.parent?.id === item.id).map(link),
  })
  return sorted.filter(item => !item.data.parent).map(link)
}

/**
 * Interface text from the `ui-strings` dictionary in the site's language, the
 * project's default locale filling gaps. A missing key shows the key itself,
 * so a gap is visible instead of silently English.
 */
export async function getStrings(): Promise<(key: string) => string> {
  const [entries, site] = await Promise.all([getCollection('uiStrings'), getSite()])
  const language = site.language ?? 'en'
  const text = new Map<string, string>()
  for (const entry of entries.toSorted((a, b) => Number(a.data.locale === language) - Number(b.data.locale === language))) {
    text.set(entry.data.key, entry.data.value)
  }
  return key => text.get(key) ?? key
}

/** Every interface string, for a client-side component that renders its own text. */
export async function getStringTable(prefixes: readonly string[]): Promise<Record<string, string>> {
  const t = await getStrings()
  const entries = await getCollection('uiStrings')
  const keys = new Set(entries.map(entry => entry.data.key).filter(key => prefixes.some(prefix => key.startsWith(prefix))))
  return Object.fromEntries([...keys].toSorted().map(key => [key, t(key)]))
}
