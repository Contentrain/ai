// /llms.txt (llmstxt.org): what a language model reads to find its way around
// the site — its name, its tagline, and the newest pages of each kind (posts,
// pages, each custom type) at their absolute addresses, none marked noindex.
// The same shape the emitter writes. Only a site with an address has it: a
// relative link is no use to a reader outside the site, so without `site`
// (astro.config.mjs) there is no file at all. (The parameter is what lets the
// route build nothing: a plain `llms.txt.ts` always writes a file.)
import type { APIRoute, GetStaticPaths } from 'astro'
import { getSite } from '../lib/content'
import { LLMS_LINKS, llmsTxt, type LlmsLink } from '../lib/llms'
import { routeTable } from '../lib/site-routes'

export const getStaticPaths = (() => (import.meta.env.SITE ? [{ params: { llms: 'llms' } }] : [])) satisfies GetStaticPaths

export const GET: APIRoute = async ({ site: origin }) => {
  const site = await getSite()
  const sections = new Map<string, LlmsLink[]>([['Posts', []], ['Pages', []]])
  const add = (name: string, link: LlmsLink) => sections.set(name, [...(sections.get(name) ?? []), link])
  for (const [path, route] of await routeTable()) {
    const data = route.view === 'post' ? route.post.data : route.view === 'page' ? route.page.data : route.view === 'entry' ? route.entry.data : undefined
    if (!data || (data.seo as { noindex?: boolean } | undefined)?.noindex) continue
    const seo = data.seo as { description?: string } | undefined
    const link: LlmsLink = {
      title: String(data.title ?? path),
      url: new URL(path, origin).href,
      description: seo?.description ?? (data.excerpt as string | undefined),
      date: data.published_at as Date | undefined,
    }
    if (route.view === 'post') add('Posts', link)
    else if (route.view === 'page') add('Pages', link)
    else if (route.view === 'entry') add(route.type.archive?.title ?? route.type.collection, link)
  }
  // Newest first; undated links keep their order after the dated ones.
  const newest = (links: LlmsLink[]) => links.map((link, index) => ({ link, index }))
    .toSorted((a, b) => (b.link.date?.getTime() ?? 0) - (a.link.date?.getTime() ?? 0) || a.index - b.index)
    .map(({ link }) => link)
    .slice(0, LLMS_LINKS)
  const body = llmsTxt({
    title: site.title,
    description: site.tagline,
    sections: [...sections].map(([name, links]) => ({ name, links: newest(links) })),
  })
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
