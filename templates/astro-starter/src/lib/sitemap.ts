// A sitemap of addresses from the route table: published entries only, never an entry marked noindex, never a redirect
// (an empty inner page's included). Posts and pages carry their last change. One per locale: the default's is
// `sitemap-0.xml`, another's `sitemap-<code>.xml`, and the index lists them all.
import { leftEmpty } from './empty-page'
import { defaultLocale } from './locales'
import type { Route } from './site-routes'

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export function sitemapXml(routes: Iterable<readonly [string, Route]>, origin: URL): string {
  const urls: string[] = []
  for (const [href, route] of routes) {
    // An inner page with nothing to build answers with a redirect, which a sitemap never lists.
    if (route.view === 'page' && !route.isHome && leftEmpty(route)) continue
    const entry = route.view === 'post' ? route.post.data : route.view === 'page' ? route.page.data : route.view === 'entry' ? route.entry.data : undefined
    if ((entry?.seo as { noindex?: boolean } | undefined)?.noindex) continue
    const changed = (entry?.modified_at ?? entry?.published_at) as Date | undefined
    urls.push(`<url><loc>${escape(new URL(href, origin).href)}</loc>${changed ? `<lastmod>${changed.toISOString()}</lastmod>` : ''}</url>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
}

/** The sitemap file of a locale, as the site serves it. */
export const sitemapFile = (locale: string): string => (locale === defaultLocale ? '/sitemap-0.xml' : `/sitemap-${locale}.xml`)
