// Pages the source site kept out of search (`EmitPost.noindex`,
// `QueryPage.noindex`) stay out of the migrated site's sitemap.
//
// `@astrojs/sitemap` lists every page the build writes; its `filter` is the
// only way to leave one out. The addresses are computed here from the route
// pattern and the entry's parameters — the values `getStaticPaths` builds the
// page from — so the filter names exactly the pages that carry the robots meta.

import type { RouteModel } from '@contentrain/types'
import type { EmitContent } from './types.js'
import { DEFAULT_COLLECTION } from './types.js'
import { entryPath } from './alternates.js'
import { collectionItems } from './pages.js'
import { patternToPagePath } from './util.js'

/** Site-root paths (directory format, `/a/b/`) of every noindex page, sorted. */
export function noindexPaths(routes: RouteModel[], content: EmitContent): string[] {
  const out = new Set<string>()
  for (const route of routes) {
    const pagePath = patternToPagePath(route.pattern)
    if (!pagePath) continue
    const dynamic = pagePath.includes('[')
    if (route.kind === 'single' || route.collection !== undefined) {
      const posts = collectionItems(content, route.collection ?? DEFAULT_COLLECTION)
      // A parameterless collection route renders its one entry at the pattern.
      if (!dynamic && posts.length !== 1) continue
      for (const post of posts) {
        if (!post.noindex) continue
        const path = entryPath(route.pattern, { ...post.params, slug: post.slug })
        if (path) out.add(path)
      }
    }
    if (route.query) {
      for (const page of content.queries?.[route.query] ?? []) {
        if (!page.noindex) continue
        const path = entryPath(route.pattern, page.params)
        if (path) out.add(path)
      }
    }
  }
  return [...out].toSorted()
}

/**
 * The `sitemap()` call for astro.config.mjs. The sitemap hands `filter` an
 * absolute, percent-encoded URL; it is compared by decoded path with the
 * trailing slash normalised, the form `noindexPaths` returns.
 */
export function sitemapIntegration(paths: string[]): string {
  if (!paths.length) return 'sitemap()'
  return `sitemap({ filter: (page) => !NOINDEX.has(sitemapPath(page)) })`
}

/** The declarations `sitemapIntegration` refers to, placed above `defineConfig`. */
export function sitemapFilterDeclarations(paths: string[]): string[] {
  if (!paths.length) return []
  return [
    `// Pages the source site kept out of search (noindex) stay out of the sitemap.`,
    `const NOINDEX = new Set(${JSON.stringify(paths)})`,
    `const sitemapPath = (page) => {`,
    `  let path = new URL(page).pathname`,
    `  try { path = decodeURI(path) } catch { /* keep the encoded path */ }`,
    `  return path.endsWith('/') ? path : \`\${path}/\``,
    `}`,
    ``,
  ]
}
