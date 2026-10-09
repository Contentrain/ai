// robots.txt: everything is crawlable and the sitemap is named by its absolute
// address, which is the only form crawlers accept.
import type { APIRoute } from 'astro'
import { withBase } from '../lib/base'

export const GET: APIRoute = ({ site }) => {
  const lines = ['User-agent: *', 'Allow: /']
  if (site) lines.push('', `Sitemap: ${new URL(withBase('/sitemap-index.xml'), site).href}`)
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
