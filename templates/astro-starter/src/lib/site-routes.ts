// The route table: every content address the site builds — front page, posts,
// pages, the blog index and the category, tag and author archives with their
// pagination — from the permalink patterns in site.config.ts. Two entries
// claiming one address fail the build instead of one silently winning. The
// pages build from it, and links are checked against it: an address that is
// not in it is not public.

import { getCollection } from 'astro:content'
import { siteConfig } from '../site.config'
import { authorHref, byId, getPosts, getStrings, pageHref, postHref, termHref, type Page, type Post } from './content'
import { pagePath, permalinks } from './routes'

export type Route =
  | { view: 'post', post: Post }
  | { view: 'page', page: Page, trail: Array<{ title: string, href: string }>, isHome: boolean }
  | { view: 'list', title?: string, eyebrow?: string, description?: string, posts: Post[], base: string, current: number, total: number }

async function buildRoutes(): Promise<Map<string, Route>> {
  const [posts, pages, categories, tags, authors, t] = await Promise.all([
    getPosts(), byId('pages'), byId('categories'), byId('tags'), getCollection('authors'), getStrings(),
  ])
  const routes = new Map<string, Route>()
  const add = (href: string, route: Route) => {
    if (routes.has(href)) throw new Error(`Two entries claim the address ${href}. Change a slug or a permalink pattern in site.config.ts.`)
    routes.set(href, route)
  }

  /** A post list split into pages at `base`, `base/page/2/`, … — page 1 exists even when empty. */
  const paginate = (base: string, list: Post[], heading: Omit<Extract<Route, { view: 'list' }>, 'view' | 'posts' | 'base' | 'current' | 'total'>) => {
    const size = siteConfig.postsPerPage
    const total = Math.max(1, Math.ceil(list.length / size))
    for (let current = 1; current <= total; current++) {
      add(pagePath(base, current), { view: 'list', ...heading, posts: list.slice((current - 1) * size, current * size), base, current, total })
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
    add(href, { view: 'page', page, trail, isHome: href === '/' })
  }

  // The posts index: the front page, or — on a site whose front page is a
  // static page — its own address (WordPress: Settings → Reading).
  const blog = siteConfig.home.kind === 'posts' ? '/' : permalinks.blog
  // The posts page keeps the name and description its editors gave it ("Journal"), as in WordPress.
  const postsPage = blog === '/' ? undefined : [...pages.values()].find(page => pageHref(page, pages) === blog)
  const blogDescription = postsPage?.data.seo?.description ?? postsPage?.data.excerpt
  paginate(blog, posts, blog === '/' ? {} : { title: postsPage?.data.title ?? t('blog.title'), ...(blogDescription ? { description: blogDescription } : {}) })

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

  return routes
}

let table: Promise<Map<string, Route>> | undefined

/** Every public address and what it shows, built once per build. */
export function routeTable(): Promise<Map<string, Route>> {
  table ??= buildRoutes()
  return table
}
