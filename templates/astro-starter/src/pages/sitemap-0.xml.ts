// Every public address, from the route table: published entries only, never
// an entry marked noindex, never a redirect. Posts and pages carry their
// last change.
import type { APIRoute } from 'astro'
import { routeTable } from '../lib/site-routes'

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL('http://localhost/')
  const urls: string[] = []
  for (const [href, route] of await routeTable()) {
    const entry = route.view === 'post' ? route.post.data : route.view === 'page' ? route.page.data : undefined
    if (entry?.seo?.noindex) continue
    const changed = entry ? entry.modified_at ?? entry.published_at : undefined
    urls.push(`<url><loc>${escape(new URL(href, origin).href)}</loc>${changed ? `<lastmod>${changed.toISOString()}</lastmod>` : ''}</url>`)
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
