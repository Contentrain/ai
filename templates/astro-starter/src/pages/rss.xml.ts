// The posts feed — at /rss.xml, and at WordPress's /feed/ through a redirect
// in the redirects collection when the source site had one.
import rss from '@astrojs/rss'
import type { APIRoute } from 'astro'
import { withBase } from '../lib/base'
import { byId, getPosts, getSite, postHref } from '../lib/content'

export const GET: APIRoute = async ({ site: origin }) => {
  const [site, posts, categories] = await Promise.all([getSite(), getPosts(), byId('categories')])
  const newest = posts.toSorted((a, b) => (b.data.published_at?.getTime() ?? 0) - (a.data.published_at?.getTime() ?? 0))
  return rss({
    title: site.title,
    description: site.tagline ?? site.title,
    // The channel's link is the site's home: in its directory under a `base`. Item links already carry it.
    site: new URL(withBase('/'), origin ?? 'http://localhost').href,
    items: newest.slice(0, 20).map(post => ({
      title: post.data.title,
      link: postHref(post, categories),
      pubDate: post.data.published_at,
      description: post.data.excerpt,
    })),
    customData: `<language>${site.language}</language>`,
  })
}
