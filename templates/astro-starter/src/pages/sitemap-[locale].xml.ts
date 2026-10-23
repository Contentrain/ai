// Each other language's addresses, at `sitemap-<code>.xml`: see lib/sitemap.ts. A site in one language has none.
import type { APIRoute, GetStaticPaths } from 'astro'
import { siteLocales } from '../lib/locales'
import { sitemapXml } from '../lib/sitemap'
import { localeRoutes } from '../lib/site-routes'

export const getStaticPaths = (() => siteLocales.slice(1).map(locale => ({ params: { locale: locale.code } }))) satisfies GetStaticPaths

export const GET: APIRoute = async ({ params, site }) => new Response(sitemapXml(await localeRoutes(params.locale ?? ''), site ?? new URL('http://localhost/')), {
  headers: { 'Content-Type': 'application/xml; charset=utf-8' },
})
