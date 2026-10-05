// The route table: every content address the site builds — front page, posts,
// pages, the blog index and the category, tag and author archives with their
// pagination — from the permalink patterns in site.config.ts. Two entries
// claiming one address fail the build instead of one silently winning. The
// pages build from it, and links are checked against it: an address that is
// not in it is not public.

import { getCollection } from 'astro:content'
import { siteConfig } from '../site.config'
import { entriesOf, entryCard, entryHref, newestFirst, refIds, termHref as customTermHref, text, type Card, type TypeEntry } from './custom'
import { targetsOf, type Targets } from './fields'
import { authorHref, byId, getPosts, getStrings, pageHref, postHref, termHref, type Page, type Post } from './content'
import { pagePath, permalinks } from './routes'
import type { CustomType } from '../site.config'

export type Route =
  | { view: 'post', post: Post }
  | { view: 'page', page: Page, trail: Array<{ title: string, href: string }>, isHome: boolean, subpages: Array<{ title: string, href: string }> }
  | { view: 'entry', type: CustomType, entry: TypeEntry, targets: Targets }
  | { view: 'list', title?: string, eyebrow?: string, description?: string, posts: Post[], cards?: Card[], base: string, current: number, total: number }

async function buildRoutes(): Promise<Map<string, Route>> {
  const [posts, pages, categories, tags, authors, t] = await Promise.all([
    getPosts(), byId('pages'), byId('categories'), byId('tags'), getCollection('authors'), getStrings(),
  ])
  const routes = new Map<string, Route>()
  const add = (href: string, route: Route) => {
    if (routes.has(href)) throw new Error(`Two entries claim the address ${href}. Change a slug or a permalink pattern in site.config.ts.`)
    routes.set(href, route)
  }

  /**
   * A post list split into pages at `base`, `base/page/2/`, … — page 1 exists even when empty. `leading`: posts the first
   * page shows on top, as WordPress does for sticky posts on the posts page — those inside the first chunk move up, those
   * outside it are added, so the page is longer than `postsPerPage`. Later pages are plain chronological chunks (a sticky
   * post shows again at its date) and the page count ignores `leading`.
   */
  const paginate = (base: string, list: Post[], heading: Omit<Extract<Route, { view: 'list' }>, 'view' | 'posts' | 'base' | 'current' | 'total'>, leading: Post[] = []) => {
    const size = siteConfig.postsPerPage
    const total = Math.max(1, Math.ceil(list.length / size))
    for (let current = 1; current <= total; current++) {
      const chunk = list.slice((current - 1) * size, current * size)
      add(pagePath(base, current), { view: 'list', ...heading, posts: current === 1 && leading.length ? [...leading, ...chunk.filter(post => !leading.includes(post))] : chunk, base, current, total })
    }
  }

  for (const post of posts) add(postHref(post), { view: 'post', post })

  for (const page of pages.values()) {
    const trail: Array<{ title: string, href: string }> = []
    const seen = new Set([page.id])
    for (let parent = page.data.parent ? pages.get(page.data.parent.id) : undefined; parent && !seen.has(parent.id); parent = parent.data.parent ? pages.get(parent.data.parent.id) : undefined) {
      seen.add(parent.id)
      trail.unshift({ title: parent.data.title, href: pageHref(parent, pages) })
    }
    const href = pageHref(page, pages)
    // The page WordPress uses as the posts page (Settings → Reading) shows the posts, not its own body.
    if (siteConfig.home.kind === 'page' && href === permalinks.blog) continue
    // Its children, in WordPress page order: an empty parent page lists them instead of standing blank.
    const subpages = [...pages.values()]
      .filter(child => child.data.parent?.id === page.id)
      .toSorted((a, b) => (a.data.menu_order ?? 0) - (b.data.menu_order ?? 0) || a.data.title.localeCompare(b.data.title))
      .map(child => ({ title: child.data.title, href: pageHref(child, pages) }))
    add(href, { view: 'page', page, trail, isHome: href === '/', subpages })
  }

  // The posts index: the front page, or — on a site whose front page is a
  // static page — its own address (WordPress: Settings → Reading).
  const blog = siteConfig.home.kind === 'posts' ? '/' : permalinks.blog
  // The posts page keeps the name and description its editors gave it ("Journal"), as in WordPress.
  const postsPage = blog === '/' ? undefined : [...pages.values()].find(page => pageHref(page, pages) === blog)
  const blogDescription = postsPage?.data.seo?.description ?? postsPage?.data.excerpt
  paginate(blog, posts, blog === '/' ? {} : { title: postsPage?.data.title ?? t('blog.title'), ...(blogDescription ? { description: blogDescription } : {}) }, posts.filter(post => post.data.sticky))

  for (const category of categories.values()) {
    paginate(termHref('category', category, categories), posts.filter(post => post.data.categories.some(ref => ref.id === category.id)), {
      title: category.data.name, eyebrow: t('archive.category'), ...(category.data.description ? { description: category.data.description } : {}),
    })
  }
  for (const tag of tags.values()) {
    paginate(termHref('tag', tag, tags), posts.filter(post => post.data.tags.some(ref => ref.id === tag.id)), {
      title: tag.data.name, eyebrow: t('archive.tag'), ...(tag.data.description ? { description: tag.data.description } : {}),
    })
  }
  for (const author of authors) {
    const own = posts.filter(post => post.data.author?.id === author.id)
    if (own.length > 0) paginate(authorHref(author), own, { title: author.data.name, eyebrow: t('archive.author'), ...(author.data.bio ? { description: author.data.bio } : {}) })
  }

  await addTypeRoutes(add)

  return routes
}

/** The custom post types: one page per entry, the archive, and a list per term — through the same pagination as the blog. */
async function addTypeRoutes(add: (href: string, route: Route) => void): Promise<void> {
  const types = siteConfig.types ?? []
  if (types.length === 0) return
  const names = new Set(types.flatMap(type => [type.collection, ...(type.taxonomies ?? []).map(taxonomy => taxonomy.collection)]))
  const entries = new Map(await Promise.all([...names].map(async name => [name, await entriesOf(name)] as const)))
  const targets = targetsOf(types, entries)
  const terms = new Map([...entries].flatMap(([name, list]) => list.map(entry => [`${name}:${entry.id}`, entry] as const)))
  const paginateCards = (base: string, cards: Card[], heading: { title: string, eyebrow?: string, description?: string }) => {
    const size = siteConfig.postsPerPage
    const total = Math.max(1, Math.ceil(cards.length / size))
    for (let current = 1; current <= total; current++) {
      add(pagePath(base, current), { view: 'list', ...heading, posts: [], cards: cards.slice((current - 1) * size, current * size), base, current, total })
    }
  }
  for (const type of types) {
    const own = newestFirst(entries.get(type.collection) ?? [], type.card.date)
    for (const entry of own) add(entryHref(type, entry), { view: 'entry', type, entry, targets })
    const cards = new Map(await Promise.all(own.map(async entry => [entry.id, await entryCard(type, entry, terms)] as const)))
    if (type.archive) paginateCards(type.archive.pattern, [...cards.values()], { title: type.archive.title, ...(type.archive.label ? { eyebrow: type.archive.label } : {}) })
    for (const taxonomy of type.taxonomies ?? []) {
      for (const term of entries.get(taxonomy.collection) ?? []) {
        const members = own.filter(entry => refIds(entry.data[taxonomy.field]).includes(term.id)).flatMap(entry => cards.get(entry.id) ?? [])
        const description = text(term.data.description)
        paginateCards(customTermHref(taxonomy, term, terms), members, { title: text(term.data.name) ?? term.id, eyebrow: taxonomy.title, ...(description ? { description } : {}) })
      }
    }
  }
}

let table: Promise<Map<string, Route>> | undefined

/** Every public address and what it shows, built once per build. */
export function routeTable(): Promise<Map<string, Route>> {
  table ??= buildRoutes()
  return table
}
