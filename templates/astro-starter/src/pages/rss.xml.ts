// The posts feed — at /rss.xml, and at WordPress's /feed/ through a redirect
// in redirects.json when the source site had one.
import rss from '@astrojs/rss'
import type { APIRoute } from 'astro'
import { getPosts, getSite, postHref } from '../lib/content'

export const GET: APIRoute = async ({ site: origin }) => {
  const [site, posts] = await Promise.all([getSite(), getPosts()])
  const newest = posts.toSorted((a, b) => (b.data.published_at?.getTime() ?? 0) - (a.data.published_at?.getTime() ?? 0))
  return rss({
    title: site.title,
    description: site.tagline ?? site.title,
    site: origin ?? 'http://localhost',
    items: newest.slice(0, 20).map(post => ({
      title: post.data.title,
      link: postHref(post),
      pubDate: post.data.published_at,
      description: post.data.excerpt,
    })),
    customData: `<language>${site.language ?? 'en'}</language>`,
  })
}
