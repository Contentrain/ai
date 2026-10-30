// Queries the pages share. Everything here reads the content layer, which the
// Contentrain loader fills from `.contentrain` — no page reads files itself.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCollection, getEntry, type CollectionEntry, type CollectionKey } from 'astro:content'
import type { ImageInput } from '../components/kit/_shared/types'
import { siteConfig } from '../site.config'
import { withBase } from './base'
import { siteLanguage, localeRank } from './language'
import { defaultLocale, entryLocale, inLocale, localeTag, localizedPath, multilingual, siteLocales } from './locales'
import { dateParams, fillPattern, permalinks } from './routes'

export type Post = CollectionEntry<'posts'>
export type Page = CollectionEntry<'pages'>
export type Category = CollectionEntry<'categories'>
export type Term = Category | CollectionEntry<'tags'>
export type Author = CollectionEntry<'authors'>
export type Media = CollectionEntry<'media'>

type Site = Omit<CollectionEntry<'site'>['data'], 'language'> & { language: string }

/**
 * The site singleton of a locale with its language settled (`siteLanguage`): never empty. A translated singleton (one
 * content file per locale) is read in the locale's; one that is not is every locale's. A site in several languages
 * prints each locale's tag from site.config.ts `locales`.
 */
export async function getSite(locale = defaultLocale): Promise<Site> {
  const site = await getEntry('site', 'site') ?? await getEntry('site', locale)
  if (!site) throw new Error('The site singleton (.contentrain/content/site/site/data.json) is missing.')
  return { ...site.data, language: siteLanguage(localeTag(locale) ?? site.data.language) }
}

/**
 * A locale's posts, newest first — WordPress's own order, which previous and next post, the feed and "more" lists follow. Posts published
 * at the same moment keep WordPress's order, the higher ID first (`lists.tieOrder` where the source's database returned the lower first), so they match the source. Sticky posts are not moved
 * here: they lead the posts page's first page only (`leading` in site-routes).
 */
export async function getPosts(locale = defaultLocale): Promise<Post[]> {
  const posts = inLocale(await getCollection('posts'), locale)
  const tie = siteConfig.lists.tieOrder === 'asc' ? -1 : 1
  return posts.toSorted((a, b) =>
    (b.data.published_at?.getTime() ?? 0) - (a.data.published_at?.getTime() ?? 0)
    || tie * ((b.data.wp_id ?? 0) - (a.data.wp_id ?? 0))
    || a.data.title.localeCompare(b.data.title))
}

/** A category's place in WordPress's choice: its term ID; one without (hand-made content) goes last. */
const termRank = (category: Category) => category.data.wp_id ?? Number.MAX_SAFE_INTEGER

/**
 * The category a post's address names, as WordPress picks it for `%category%`: the primary category an SEO plugin
 * set (Yoast's or Rank Math's, imported as `primary_category`) when the post is in it, else the post's category with
 * the lowest term ID.
 * Undefined when the post has none.
 */
function primaryCategory(post: Post, categories: ReadonlyMap<string, Category>): Category | undefined {
  const own = post.data.categories.flatMap((ref) => {
    const category = categories.get(ref.id)
    return category ? [category] : []
  })
  // Only a category the post is in, as Yoast and Rank Math themselves check: a stale primary does not move the post.
  const primary = post.data.primary_category ? own.find(category => category.id === post.data.primary_category!.id) : undefined
  if (primary) return primary
  return own.toSorted((a, b) => termRank(a) - termRank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]
}

/**
 * The `:category` value: the primary category with its parents (`news/local`). A post with no category takes the
 * default category's slug alone, as WordPress does (`siteConfig.defaultCategory`, else `uncategorized`).
 */
function categoryPath(post: Post, categories: ReadonlyMap<string, Category>): string {
  const category = primaryCategory(post, categories)
  return category ? termTrail(category, categories).join('/') : (siteConfig.defaultCategory ?? 'uncategorized')
}

/** A slug as the store spells one (wp-import's `addressSlug`): lowercase letters, digits and marks, the rest one `-`. */
function storeSlug(segment: string): string {
  let text = segment
  try { text = decodeURIComponent(segment) }
  catch { /* as written */ }
  return text.normalize('NFC').toLowerCase().normalize('NFC').replace(/[^\p{Ll}\p{Lo}\p{Lm}\p{N}\p{M}]+/gu, '-').replace(/^-+|-+$/g, '')
}

/** A site path as `path` takes one: starts and ends with `/`, no query, no fragment, no origin, no empty or dot segment. */
const SITE_PATH = /^\/(?:[^/?#\s.][^/?#\s]*\/)+$/

/**
 * An entry's own address kept from the old site (`path`: `/announcements/kristen_mathiasen/`, a slug the store spells
 * `kristen-mathiasen`; `/company/about-us/` under a parent page that did not move; `/docs/hosting/backups/` in a tree
 * of a custom type). Posts, pages, categories, tags, and a custom type's entries and terms all read it. The migration
 * sets it where the permalink pattern would build another address. It is an override of the pattern, never a second
 * address: it holds while its last segment is the entry's slug as the store spells it. An editor who changes the slug
 * moves the entry to the pattern's address, and the old one redirects there (`stalePaths`, 301). Clearing the field
 * moves the entry too; the old address then needs a rule in `redirects`.
 */
export function keptPath(raw: unknown, slug: string): string | undefined {
  if (typeof raw !== 'string' || !SITE_PATH.test(raw)) return undefined
  // The last segment: SITE_PATH ends in one, then `/`.
  return storeSlug(raw.slice(raw.lastIndexOf('/', raw.length - 2) + 1, -1)) === slug ? raw : undefined
}

/** A `path` that is a site path but no longer the entry's (its slug left it): the old address to redirect, or undefined. */
export function stalePath(raw: unknown, slug: string): string | undefined {
  return typeof raw === 'string' && SITE_PATH.test(raw) && !keptPath(raw, slug) ? raw : undefined
}

const pathOf = (entry: { data: object }): unknown => (entry.data as { path?: unknown }).path

/**
 * The kept addresses whose entry's slug has changed since — posts, pages, categories and tags: each leads to where the
 * entry is now (a 301 rule). A custom type's are `staleTypePaths` (custom.ts).
 */
export async function stalePaths(): Promise<Array<{ from: string, to: string }>> {
  const [posts, pages, categories, tags] = await Promise.all([Promise.all(siteLocales.map(locale => getPosts(locale.code))).then(lists => lists.flat()), byId('pages'), byId('categories'), byId('tags')])
  // A kept address is the entry's within its locale: the old one is under the locale's prefix too.
  const moved = (entry: { data: object }, slug: string, to: () => string) => {
    const from = stalePath(pathOf(entry), slug)
    return from ? [{ from: localizedPath(from, entryLocale(entry)), to: to() }] : []
  }
  return [
    ...posts.flatMap(post => moved(post, post.data.slug, () => postHref(post, categories))),
    ...[...pages.values()].flatMap(page => moved(page, page.data.slug, () => pageHref(page, pages))),
    ...[...categories.values()].flatMap(term => moved(term, term.data.slug, () => termHref('category', term, categories))),
    ...[...tags.values()].flatMap(term => moved(term, term.data.slug, () => termHref('tag', term, tags))),
  ]
}

/**
 * A post's address: its kept `path` (`keptPath`), else the permalink pattern. `categories` (`byId('categories')`) fills
 * `:category`; a pattern without it never reads them.
 */
export function postHref(post: Post, categories: ReadonlyMap<string, Category>): string {
  const kept = keptPath(pathOf(post), post.data.slug)
  if (kept) return localizedPath(withBase(kept), entryLocale(post))
  return localizedPath(withBase(fillPattern(permalinks.post, {
    slug: post.data.slug,
    id: String(post.data.wp_id ?? post.data.id),
    ...dateParams(post.data.published_at),
    ...(permalinks.post.includes(':category') ? { category: categoryPath(post, categories) } : {}),
  })), entryLocale(post))
}

/**
 * The front page `siteConfig.home` names by slug. Pages under different parents may share a slug (`/faq/` and
 * `/services/faq/`): the front page is the top-level one, and a child page with that slug keeps its own address. A
 * child page is the front page only when no other page of its locale has its slug. In another locale the front page is
 * the default's front page translated (the same entry id), whatever its slug there.
 */
function isHomePage(page: Page, pages: ReadonlyMap<string, Page>): boolean {
  if (siteConfig.home.kind !== 'page') return false
  const locale = entryLocale(page)
  const original = multilingual && locale !== defaultLocale ? [...pages.values()].find(other => entryLocale(other) === defaultLocale && other.data.id === page.data.id) : undefined
  if (original) return isHomePage(original, pages)
  if (siteConfig.home.slug !== page.data.slug) return false
  return !page.data.parent || [...pages.values()].every(other => other === page || other.data.slug !== page.data.slug || entryLocale(other) !== locale)
}

/**
 * A page's address carries its parents: `about/team`. The page at the top of that trail may carry `path_prefix`: the
 * folders before its address on the old site when its parent page was not moved (`company` for `/company/about-us/`,
 * `index.php` for a site whose pages lived under it). The migration sets it on those pages only; an editor sees it,
 * and clearing it (or giving the page a parent) is how a page moves — a page an editor made top-level has none.
 * A kept `path` (`keptPath`) is the page's whole address and wins over both; the front page is always the root.
 */
export function pageHref(page: Page, pages: ReadonlyMap<string, Page>): string {
  const locale = entryLocale(page)
  if (isHomePage(page, pages)) return localizedPath(withBase('/'), locale)
  const kept = keptPath(pathOf(page), page.data.slug)
  if (kept) return localizedPath(withBase(kept), locale)
  const trail: string[] = []
  const seen = new Set<string>()
  let top: Page = page
  for (let at: Page | undefined = page; at && !seen.has(at.id); at = at.data.parent ? pages.get(at.data.parent.id) : undefined) {
    seen.add(at.id)
    trail.unshift(at.data.slug)
    top = at
  }
  // As an editor typed it: blank, `.` and `..` segments are dropped, so a prefix never climbs or doubles a slash.
  // Read whatever the pages model is: a project whose model has no `path_prefix` (an older store) builds as before.
  const raw = (top.data as { path_prefix?: unknown }).path_prefix
  const prefix = (typeof raw === 'string' ? raw : '').split('/').map((segment: string) => segment.trim()).filter((segment: string) => segment && segment !== '.' && segment !== '..')
  return localizedPath(withBase(fillPattern(permalinks.page, { slug: page.data.slug, path: [...prefix, ...trail].join('/') })), locale)
}

/** Categories nest; tags have no parent field. */
const parentOf = (term: Term) => ('parent' in term.data ? term.data.parent : undefined)

/** A term's slug after its parents' (`news`, `local` → `['news', 'local']`); a parent loop stops at the first repeat. */
function termTrail<T extends Term>(term: T, terms: ReadonlyMap<string, T>): string[] {
  const trail: string[] = []
  const seen = new Set<string>()
  for (let at: T | undefined = term; at && !seen.has(at.id); at = parentOf(at) ? terms.get(parentOf(at)!.id) : undefined) {
    seen.add(at.id)
    trail.unshift(at.data.slug)
  }
  return trail
}

/** A category's or tag's address: its kept `path` (`keptPath`), else the pattern with its parents. */
export function termHref(kind: 'category' | 'tag', term: Term, terms: ReadonlyMap<string, Term>): string {
  const kept = keptPath(pathOf(term), term.data.slug)
  if (kept) return localizedPath(withBase(kept), entryLocale(term))
  return localizedPath(withBase(fillPattern(permalinks[kind], { slug: term.data.slug, path: termTrail(term, terms).join('/') })), entryLocale(term))
}

/** An author's archive in a locale: an author is no translated entry, so each locale lists their posts in it. */
export function authorHref(author: Author, locale = defaultLocale): string {
  return localizedPath(withBase(fillPattern(permalinks.author, { slug: author.data.slug })), locale)
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
async function stringMap(locale: string): Promise<Map<string, string>> {
  const [entries, site] = await Promise.all([getCollection('uiStrings'), getSite(locale)])
  const { language } = site
  const text = new Map<string, string>()
  for (const entry of entries.toSorted((a, b) => localeRank(a.data.locale, language) - localeRank(b.data.locale, language))) {
    text.set(entry.data.key, entry.data.value)
  }
  return text
}

export async function getStrings(locale = defaultLocale): Promise<(key: string) => string> {
  const text = await stringMap(locale)
  return key => text.get(key) ?? key
}

/**
 * The site's own words for what `site.config.ts` names (a custom type's archive heading, a field's label): the
 * `ui-strings` entry when the store has one — an editor renames it in Studio —, else the config's value. Never the key.
 * Keys: `types.<collection>.archive_title`, `types.<collection>.archive_label`, `types.<collection>.<taxonomy>.title`,
 * `types.<collection>.fields.<field>` (a nested field: `fields.<group>.<field>`), `posts.<taxonomy>.title` (`postTaxonomies`).
 */
export async function getTextOr(locale = defaultLocale): Promise<(key: string, fallback: string) => string> {
  const text = await stringMap(locale)
  return (key, fallback) => text.get(key)?.trim() || fallback
}

/**
 * The footer's copyright line: the site's own (`site.copyright`, edited in Studio; empty = no line), else the line the
 * theme printed (`site.config.ts`), else the footer's default.
 */
export function copyrightOf(own: string | undefined): string | false | undefined {
  if (own !== undefined) return own.trim() ? own : false
  return siteConfig.footer?.copyright ?? siteConfig.chrome?.copyright
}

/** Every interface string, for a client-side component that renders its own text. */
export async function getStringTable(prefixes: readonly string[], locale = defaultLocale): Promise<Record<string, string>> {
  const t = await getStrings(locale)
  const entries = await getCollection('uiStrings')
  const keys = new Set(entries.map(entry => entry.data.key).filter(key => prefixes.some(prefix => key.startsWith(prefix))))
  return Object.fromEntries([...keys].toSorted().map(key => [key, t(key)]))
}

/**
 * The redirects collection, or none without reading it when no redirect is written
 * (.contentrain/content/<domain>/redirects/data.json): a site with none is the common case, and Astro warns that an
 * empty collection "does not exist or is empty" on every build that asks for it.
 */
export async function getRedirects(): Promise<Array<CollectionEntry<'redirects'>>> {
  let written = false
  try {
    const root = join(process.cwd(), '.contentrain')
    const { domain } = JSON.parse(readFileSync(join(root, 'models', 'redirects.json'), 'utf8')) as { domain: string }
    written = Object.keys(JSON.parse(readFileSync(join(root, 'content', domain, 'redirects', 'data.json'), 'utf8')) as object).length > 0
  }
  catch { written = false }
  return written ? getCollection('redirects') : []
}
