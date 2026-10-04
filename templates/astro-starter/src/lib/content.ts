// Queries the pages share. Everything here reads the content layer, which the
// Contentrain loader fills from `.contentrain` — no page reads files itself.

import { getCollection, getEntry, type CollectionEntry, type CollectionKey } from 'astro:content'
import type { ImageInput } from '../components/kit/_shared/types'
import { siteConfig } from '../site.config'
import { siteLanguage, localeRank } from './language'
import { dateParams, fillPattern, permalinks } from './routes'

export type Post = CollectionEntry<'posts'>
export type Page = CollectionEntry<'pages'>
export type Term = CollectionEntry<'categories'> | CollectionEntry<'tags'>
export type Author = CollectionEntry<'authors'>
export type Media = CollectionEntry<'media'>

type Site = Omit<CollectionEntry<'site'>['data'], 'language'> & { language: string }

/** The site singleton with its language settled (`siteLanguage`): never empty. */
export async function getSite(): Promise<Site> {
  const site = await getEntry('site', 'site')
  if (!site) throw new Error('The site singleton (.contentrain/content/site/site/data.json) is missing.')
  return { ...site.data, language: siteLanguage(site.data.language) }
}

/**
 * Newest first; sticky posts lead, as on a WordPress front page. Posts published at the same moment
 * keep WordPress's order, the higher ID first, so the previous and next post and lists match the source.
 */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts')
  return posts.toSorted((a, b) =>
    Number(b.data.sticky) - Number(a.data.sticky)
    || (b.data.published_at?.getTime() ?? 0) - (a.data.published_at?.getTime() ?? 0)
    || (b.data.wp_id ?? 0) - (a.data.wp_id ?? 0)
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

/** Categories nest; tags have no parent field. */
const parentOf = (term: Term) => ('parent' in term.data ? term.data.parent : undefined)

export function termHref(kind: 'category' | 'tag', term: Term, terms: ReadonlyMap<string, Term>): string {
  const trail: string[] = []
  const seen = new Set<string>()
  for (let at: Term | undefined = term; at && !seen.has(at.id); at = parentOf(at) ? terms.get(parentOf(at)!.id) : undefined) {
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

/**
 * Interface text from the `ui-strings` dictionary: the entry in the site's own tag (`tr-TR`) wins, then
 * the same language (`tr`), then English, then any other locale's entry fills what is missing.
 * A key no locale has shows the key itself.
 */
export async function getStrings(): Promise<(key: string) => string> {
  const [entries, site] = await Promise.all([getCollection('uiStrings'), getSite()])
  const { language } = site
  const text = new Map<string, string>()
  for (const entry of entries.toSorted((a, b) => localeRank(a.data.locale, language) - localeRank(b.data.locale, language))) {
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
