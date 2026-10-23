// The default language's addresses (every address on a site in one language), from the route table: see lib/sitemap.ts.
import type { APIRoute } from 'astro'
import { defaultLocale } from '../lib/locales'
import { sitemapXml } from '../lib/sitemap'
import { localeRoutes } from '../lib/site-routes'

export const GET: APIRoute = async ({ site }) => new Response(sitemapXml(await localeRoutes(defaultLocale), site ?? new URL('http://localhost/')), {
  headers: { 'Content-Type': 'application/xml; charset=utf-8' },
})
