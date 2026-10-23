// The posts feed of a locale: the default's at /rss.xml (and at WordPress's /feed/ through a redirect in the redirects
// collection when the source site had one), another language's under its prefix (`/de/rss.xml`).
import rss from '@astrojs/rss'
import { withBase } from './base'
import { byId, getPosts, getSite, postHref } from './content'
import { localizedPath } from './locales'

export async function feed(locale: string, origin: URL | undefined): Promise<Response> {
  const [site, posts, categories] = await Promise.all([getSite(locale), getPosts(locale), byId('categories')])
  const newest = posts.toSorted((a, b) => (b.data.published_at?.getTime() ?? 0) - (a.data.published_at?.getTime() ?? 0))
  return rss({
    title: site.title,
    description: site.tagline ?? site.title,
    // The channel's link is the locale's home: in its directory under a `base`. Item links already carry it.
    site: new URL(localizedPath(withBase('/'), locale), origin ?? 'http://localhost').href,
    items: newest.slice(0, 20).map(post => ({
      title: post.data.title,
      link: postHref(post, categories),
      pubDate: post.data.published_at,
      description: post.data.excerpt,
    })),
    customData: `<language>${site.language}</language>`,
  })
}
