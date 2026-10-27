// The route table: every content address the site builds — front page, posts,
// pages, the blog index and the category, tag and author archives with their
// pagination — from the permalink patterns in site.config.ts. Two entries
// claiming one address fail the build instead of one silently winning. The
// pages build from it, and links are checked against it: an address that is
// not in it is not public. A site in several languages builds the whole table
// once per locale, from that locale's entries, under its prefix; an address in
// one locale knows its translations in the others.

import { getCollection } from 'astro:content'
import { collections } from '../content.config'
import { siteConfig } from '../site.config'
import { entriesOf, entryCard, entryHref, newestFirst, refIds, termHref as customTermHref, text, type Card, type TypeEntry } from './custom'
import { targetsOf, type Targets } from './fields'
import { authorHref, byId, getPosts, getSite, getStrings, getTextOr, pageHref, postHref, termHref, type Page, type Post } from './content'
import { withBase } from './base'
import { pagePath, permalinks } from './routes'
import { inLocale, localizedPath, sharedIn, siteLocales } from './locales'
import * as composed from '../views/composed'
import type { CustomType } from '../site.config'

/** One page of a post list: its posts (sticky ones first on page 1), where the list lives, which page, how many. */
export interface ListPage { posts: Post[], base: string, current: number, total: number }

export type Route =
  | { view: 'post', post: Post }
  /** `list`: page 1 of the post list, when a composed page carries it (the front page, or the posts page, drawn from sections). */
  | { view: 'page', page: Page, trail: Array<{ title: string, href: string }>, isHome: boolean, subpages: Array<{ title: string, href: string }>, list?: ListPage }
  /** `trail`: the entry's breadcrumb (`chrome.breadcrumbs: 'always'`): the home page, then its type's archive when it has one. */
  | { view: 'entry', type: CustomType, entry: TypeEntry, targets: Targets, trail?: Crumb[] }
  /** `trail`: an archive's breadcrumb (`chrome.breadcrumbs: 'always'`): the home page, then a term's type archive. */
  | { view: 'list', title?: string, eyebrow?: string, description?: string, seo?: Page['data']['seo'], posts: Post[], cards?: Card[], base: string, current: number, total: number, trail?: Crumb[] }

/** One step of a breadcrumb trail, root first. */
export interface Crumb { title: string, href: string }

type PageRoute = Extract<Route, { view: 'page' }>

/**
 * What an address is besides its route: its locale, and what it shows across locales (`key`: a post by its entry id, a
 * list's page by the list and the page number), which its translations share.
 */
interface RouteMeta { locale: string, key: string }

type Add = (href: string, route: Route, key: string) => void

async function buildRoutes(): Promise<{ routes: Map<string, Route>, meta: Map<string, RouteMeta> }> {
  const routes = new Map<string, Route>()
  const meta = new Map<string, RouteMeta>()
  const adder = (locale: string): Add => (href, route, key) => {
    if (routes.has(href)) throw new Error(`Two entries claim the address ${href}. Change a slug or a permalink pattern in site.config.ts.`)
    routes.set(href, route)
    meta.set(href, { locale, key })
  }
  // One locale after the other, the default first: the table keeps a stable order.
  await siteLocales.reduce((done, { code }) => done.then(() => buildLocale(code, adder(code))), Promise.resolve())
  return { routes, meta }
}

async function buildLocale(locale: string, add: Add): Promise<void> {
  const [posts, pages, categories, tags, authors, t, site] = await Promise.all([
    getPosts(locale), byId('pages'), byId('categories'), byId('tags'), getCollection('authors'), getStrings(locale), getSite(locale),
  ])
  // The front page's address: the site's directory (`/`, or `/blog/` under a `base`), under the locale's prefix.
  const home = localizedPath(withBase('/'), locale)
  // A source that prints its breadcrumb on every page prints it on its archives and entries too, from the home page.
  const root: Crumb[] | undefined = siteConfig.chrome?.breadcrumbs === 'always' ? [{ title: site.title, href: home }] : undefined

  /**
   * A post list split into pages at `base`, `base/page/2/`, … — page 1 exists even when empty. `leading`: posts the first
   * page shows on top, as WordPress does for sticky posts on the posts page — those inside the first chunk move up, those
   * outside it are added, so the page is longer than `postsPerPage`. Later pages are plain chronological chunks (a sticky
   * post shows again at its date) and the page count ignores `leading`. `first`: the route page 1 is instead, a composed
   * page that carries the list (`list`) among its own sections; the later pages stay lists.
   */
  const paginate = (key: string, base: string, list: Post[], heading: Omit<Extract<Route, { view: 'list' }>, 'view' | 'posts' | 'base' | 'current' | 'total'>, leading: Post[] = [], first?: (page: ListPage) => PageRoute) => {
    const size = siteConfig.postsPerPage
    const total = Math.max(1, Math.ceil(list.length / size))
    for (let current = 1; current <= total; current++) {
      const chunk = list.slice((current - 1) * size, current * size)
      const page: ListPage = { posts: current === 1 && leading.length ? [...leading, ...chunk.filter(post => !leading.includes(post))] : chunk, base, current, total }
      if (current === 1 && first) {
        const route = first(page)
        add(base, route, pageKey(route.page))
      }
      else add(pagePath(base, current), { view: 'list', ...heading, ...page, ...(root && base !== home ? { trail: root } : {}) }, `${key}:${current}`)
    }
  }

  // The posts index: the front page, or — on a site whose front page is a static page — its own address (WordPress:
  // Settings → Reading). A front page composed from sections with no page entry (`home.view`) keeps the list at `/` when
  // the site gives it no address of its own.
  const front = siteConfig.home.kind === 'page' && siteConfig.home.view !== undefined && !siteConfig.home.slug ? frontPage(site, siteConfig.home.view) : undefined
  const blog = siteConfig.home.kind === 'posts' || (front && localizedPath(withBase(permalinks.blog || '/'), locale) === home) ? home : localizedPath(withBase(permalinks.blog), locale)
  // The composed views that print the list they carry (`listViews`). An index written without it (an older writer, an
  // agent's own) names none: the list's first page then stays a plain list, never a page that drops it.
  const { composedViews } = composed
  const listViews = 'listViews' in composed ? composed.listViews as ReadonlySet<number> : new Set<number>()
  const takesList = (route: PageRoute | undefined) => route && listViews.has(route.page.data.wp_id ?? -1) ? route : undefined
  // The posts page, when it is composed from sections and prints the list: it keeps them, with the list's first page among them.
  let postsRoute: PageRoute | undefined

  for (const post of posts) add(postHref(post, categories), { view: 'post', post }, `posts:${post.data.id}`)

  for (const page of inLocale([...pages.values()], locale)) {
    const trail: Array<{ title: string, href: string }> = []
    const seen = new Set([page.id])
    for (let parent = page.data.parent ? pages.get(page.data.parent.id) : undefined; parent && !seen.has(parent.id); parent = parent.data.parent ? pages.get(parent.data.parent.id) : undefined) {
      seen.add(parent.id)
      trail.unshift({ title: parent.data.title, href: pageHref(parent, pages) })
    }
    const href = pageHref(page, pages)
    // A source that prints its breadcrumb on every page starts it from the home page, top-level pages included.
    if (siteConfig.chrome?.breadcrumbs === 'always' && href !== home && trail[0]?.href !== home) trail.unshift({ title: site.title, href: home })
    // Its children, in WordPress page order: an empty parent page lists them instead of standing blank.
    const subpages = [...pages.values()]
      .filter(child => child.data.parent?.id === page.id)
      .toSorted((a, b) => (a.data.menu_order ?? 0) - (b.data.menu_order ?? 0) || a.data.title.localeCompare(b.data.title))
      .map(child => ({ title: child.data.title, href: pageHref(child, pages) }))
    const route: PageRoute = { view: 'page', page, trail, isHome: href === home, subpages }
    // The page WordPress uses as the posts page (Settings → Reading) shows the posts, not its own body; one composed from
    // sections keeps them, the list among them (below).
    // A site with no posts (a landing or corporate site) has no list to show there: the page stays a page.
    if (siteConfig.home.kind === 'page' && href === blog && posts.length) {
      if (composedViews[page.data.wp_id ?? -1]) postsRoute = takesList(route)
      continue
    }
    add(href, route, pageKey(page))
  }

  // The posts page keeps the name and description its editors gave it ("Journal"), as in WordPress.
  const postsPage = blog === home ? undefined : inLocale([...pages.values()], locale).find(page => pageHref(page, pages) === blog)
  const blogDescription = postsPage?.data.seo?.description ?? postsPage?.data.excerpt
  // …and the SEO its plugin gave it: the document title, the link preview's own title and text (Yoast's og:title).
  const blogSeo = postsPage?.data.seo
  const frontRoute: PageRoute | undefined = front && { view: 'page', page: front, trail: [], isHome: true, subpages: [] }
  if (frontRoute && blog !== home) add(home, frontRoute, pageKey(frontRoute.page))
  // Page 1 of the list in a composed page that prints it: the front page when the list is at `/`, else the posts page when
  // it has sections.
  const carrier = blog === home ? takesList(frontRoute) : postsRoute
  // No posts and the list away from the front page: no empty list at the posts address (a page may stand there, above).
  if (posts.length || blog === home || carrier) paginate('blog', blog, posts, blog === home ? {} : { title: postsPage?.data.title ?? t('blog.title'), ...(blogDescription ? { description: blogDescription } : {}), ...(blogSeo ? { seo: blogSeo } : {}) }, posts.filter(post => post.data.sticky), carrier ? list => ({ ...carrier, list }) : undefined)

  for (const category of inLocale([...categories.values()], locale)) {
    paginate(`categories:${category.data.id}`, termHref('category', category, categories), posts.filter(post => post.data.categories.some(ref => ref.id === category.id)), {
      title: category.data.name, eyebrow: t('archive.category'), ...(category.data.description ? { description: category.data.description } : {}),
    })
  }
  for (const tag of inLocale([...tags.values()], locale)) {
    paginate(`tags:${tag.data.id}`, termHref('tag', tag, tags), posts.filter(post => post.data.tags.some(ref => ref.id === tag.id)), {
      title: tag.data.name, eyebrow: t('archive.tag'), ...(tag.data.description ? { description: tag.data.description } : {}),
    })
  }
  // An author is no translated entry: each locale lists the author's posts in it.
  for (const author of sharedIn(authors, locale)) {
    const own = posts.filter(post => post.data.author?.id === author.id)
    if (own.length > 0) paginate(`authors:${author.data.id}`, authorHref(author, locale), own, { title: author.data.name, eyebrow: t('archive.author'), ...(author.data.bio ? { description: author.data.bio } : {}) })
  }

  await addTypeRoutes(locale, add, root)
}

/** What a page shows across locales: its entry id, which its translations share (the composed front page has none of its own). */
const pageKey = (page: Page) => `pages:${page.data.id}`

/** The custom post types: one page per entry, the archive, and a list per term — through the same pagination as the blog. */
async function addTypeRoutes(locale: string, add: Add, root: Crumb[] | undefined): Promise<void> {
  const types = siteConfig.types ?? []
  if (types.length === 0) return
  const names = new Set(types.flatMap(type => [type.collection, ...(type.taxonomies ?? []).map(taxonomy => taxonomy.collection)]))
  const [entries, textOr] = await Promise.all([
    Promise.all([...names].map(async name => [name, inLocale(await entriesOf(name), locale)] as const)).then(list => new Map(list)),
    getTextOr(locale),
  ])
  const targets = targetsOf(types, entries)
  const terms = new Map([...entries].flatMap(([name, list]) => list.map(entry => [`${name}:${entry.id}`, entry] as const)))
  const paginateCards = (key: string, base: string, cards: Card[], heading: { title: string, eyebrow?: string, description?: string, trail?: Crumb[] }) => {
    const size = siteConfig.postsPerPage
    const total = Math.max(1, Math.ceil(cards.length / size))
    for (let current = 1; current <= total; current++) {
      add(pagePath(base, current), { view: 'list', ...heading, posts: [], cards: cards.slice((current - 1) * size, current * size), base, current, total }, `${key}:${current}`)
    }
  }
  const idOf = (entry: TypeEntry) => text(entry.data.id) ?? entry.id
  for (const type of types) {
    const own = newestFirst(entries.get(type.collection) ?? [], type.card.date)
    // The archive's heading: the editor's words in `ui-strings`, else the config's.
    const archive = type.archive ? { title: textOr(`types.${type.collection}.archive_title`, type.archive.title), href: localizedPath(withBase(type.archive.pattern), locale) } : undefined
    // Below the type's archive: its entries and its terms' lists.
    const under = root && [...root, ...(archive ? [archive] : [])]
    for (const entry of own) {
      const href = entryHref(type, entry)
      if (href) add(href, { view: 'entry', type, entry, targets, ...(under ? { trail: under } : {}) }, `${type.collection}:${idOf(entry)}`)
    }
    const cards = new Map(await Promise.all(own.map(async entry => [entry.id, await entryCard(type, entry, terms)] as const)))
    // The archive's eyebrow, and each term archive's: the editor's words in `ui-strings`, else the config's.
    if (type.archive && archive) {
      const label = type.archive.label ? textOr(`types.${type.collection}.archive_label`, type.archive.label) : undefined
      paginateCards(`${type.collection}:archive`, archive.href, [...cards.values()], { title: archive.title, ...(label ? { eyebrow: label } : {}), ...(root ? { trail: root } : {}) })
    }
    for (const taxonomy of type.taxonomies ?? []) {
      for (const term of entries.get(taxonomy.collection) ?? []) {
        const members = own.filter(entry => refIds(entry.data[taxonomy.field]).includes(term.id)).flatMap(entry => cards.get(entry.id) ?? [])
        const description = text(term.data.description)
        paginateCards(`${taxonomy.collection}:${idOf(term)}`, customTermHref(taxonomy, term, terms), members, { title: text(term.data.name) ?? term.id, eyebrow: textOr(`types.${type.collection}.${taxonomy.collection}.title`, taxonomy.title), ...(description ? { description } : {}), ...(under ? { trail: under } : {}) })
      }
    }
  }
}

/**
 * The front page a migration composed from sections with no page entry of its own (`home.view`): the site's title, its
 * home SEO (the `site` singleton's `seo`, `social_image` its picture), no body, keyed to the composed view by `wp_id`.
 * Read through the site's own pages schema, as Astro reads a real page entry: every default a page gets is filled
 * (`comments_open`, `seo.noindex`, whatever its model adds), and a field it requires with none fails the build here.
 */
function frontPage(site: Awaited<ReturnType<typeof getSite>>, view: number): Page {
  const seo = site.seo || site.social_image ? { seo: { ...site.seo, ...(site.social_image ? { image: site.social_image } : {}) } } : {}
  const schema = collections.pages.schema
  if (typeof schema !== 'object') throw new Error('content.config.ts: the pages collection\'s schema is not an object schema; the composed front page cannot be read through it.')
  return { id: 'front-page', collection: 'pages', data: schema.parse({ id: 'front-page', slug: '', title: site.title, wp_id: view, ...seo }) }
}

let table: ReturnType<typeof buildRoutes> | undefined

const built = () => (table ??= buildRoutes())

/** Every public address and what it shows, in every locale, built once per build. */
export async function routeTable(): Promise<Map<string, Route>> {
  return (await built()).routes
}

/** A locale's addresses and what each shows, in the table's order. */
export async function localeRoutes(locale: string): Promise<Array<[string, Route]>> {
  const { routes, meta } = await built()
  return [...routes].filter(([href]) => meta.get(href)?.locale === locale)
}

/**
 * The same page in every locale that has it, the default's first, this one included: a post and its translations, a
 * list's page and the same page of the list in another locale. Empty when no other locale has it (a page not
 * translated, a site in one language): a page then names no alternates.
 */
export async function alternatesOf(href: string): Promise<Array<{ locale: string, href: string }>> {
  const { meta } = await built()
  const own = meta.get(href)
  if (!own || siteLocales.length < 2) return []
  index ??= groupByKey(meta)
  const same = index.get(own.key) ?? []
  return same.length > 1 ? same : []
}

let index: Map<string, Array<{ locale: string, href: string }>> | undefined

function groupByKey(meta: ReadonlyMap<string, RouteMeta>): Map<string, Array<{ locale: string, href: string }>> {
  const groups = new Map<string, Array<{ locale: string, href: string }>>()
  const order = new Map(siteLocales.map((locale, at) => [locale.code, at]))
  for (const [href, { locale, key }] of meta) {
    const group = groups.get(key) ?? []
    // One address per locale: the first a locale built for the key (a translated front page is never twice).
    if (!group.some(other => other.locale === locale)) group.push({ locale, href })
    groups.set(key, group)
  }
  return new Map([...groups].map(([key, group]) => [key, group.toSorted((a, b) => (order.get(a.locale) ?? 0) - (order.get(b.locale) ?? 0))]))
}
