// The sitemap index crawlers are pointed at (robots.txt, <link rel="sitemap">): one sitemap per language.
import type { APIRoute } from 'astro'
import { withBase } from '../lib/base'
import { siteLocales } from '../lib/locales'
import { sitemapFile } from '../lib/sitemap'

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL('http://localhost/')
  const maps = siteLocales.map(locale => `<sitemap><loc>${new URL(withBase(sitemapFile(locale.code)), origin).href}</loc></sitemap>`)
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${maps.join('')}</sitemapindex>
`
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
