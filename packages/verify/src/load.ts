// ─── Reading a built directory ───
//
// The one place this package touches a filesystem. Kept apart from the checks
// so the engine stays pure: a consumer that already holds the documents — a
// migration runner, a CI step with an artefact — imports `verify` and never
// loads this module.

import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { isSitemapIndex, sitemapLocations } from './html.js'
import type { VerifyDocument, VerifyFile, VerifyInput } from './types.js'
import { identity } from './url.js'

const DOCUMENT_EXT = /\.html?$/i
const TEXT_EXT = /\.(css|m?js|cjs|json|xml|txt|svg)$/i

async function walk(dir: string, root: string, files: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full, root, files)
      continue
    }
    files.push(relative(root, full))
  }
  return files
}

/**
 * Load a static build as a verification input: every `.html` becomes a
 * document served at its path, everything else becomes an asset.
 *
 * `dist/about/index.html` is served at `/about/`, which `identity()` then
 * reduces to `/about` — the same address a link to `/about/` or
 * `/about/index.html` resolves to.
 */
export async function loadSiteDirectory(dir: string, site?: string): Promise<Pick<VerifyInput, 'documents' | 'assets' | 'files' | 'sitemap' | 'site' | 'build'>> {
  const files = await walk(dir, dir)
  const documents: VerifyDocument[] = []
  const assets: string[] = []
  const texts: VerifyFile[] = []
  const sitemaps = new Map<string, string>()

  for (const file of files.toSorted()) {
    const served = `/${file.split(sep).join('/')}`
    if (DOCUMENT_EXT.test(file)) {
      documents.push({ url: served, html: await readFile(join(dir, file), 'utf8'), status: 200 })
      continue
    }
    if (/^\/sitemap[^/]*\.xml$/i.test(served)) sitemaps.set(served, await readFile(join(dir, file), 'utf8'))
    // Stylesheets and scripts are read as text so the content scans can see
    // them. A `url()` pointing at the old host is exactly as fatal as one in
    // the HTML, and a scan that skips CSS reports a number smaller than the
    // truth — which is worse than not counting when two tools compare figures.
    if (TEXT_EXT.test(file)) {
      texts.push({ path: served, content: await readFile(join(dir, file), 'utf8') })
    }
    assets.push(served)
  }

  return { documents, assets, files: texts, sitemap: combineSitemaps(sitemaps, site), site, build: true }
}

/**
 * Every page address a build's sitemap files list, as one `<urlset>`.
 *
 * A build rarely writes a single `sitemap.xml`. `@astrojs/sitemap` writes
 * `sitemap-index.xml` naming `sitemap-0.xml`, `sitemap-1.xml`, …; reading any
 * one of those files alone gives either no pages or some of them, and the
 * membership checks then report pages missing that are listed.
 *
 * When there is an index, only the sitemaps it names count — that is what a
 * crawler following it reads. A named sitemap the build does not serve is kept
 * as an entry, so the stale-entry check reports it instead of it disappearing.
 */
function combineSitemaps(sitemaps: Map<string, string>, site?: string): string | undefined {
  if (sitemaps.size === 0) return undefined
  const documents = [...sitemaps.values()]
  const indexes = documents.filter(isSitemapIndex)
  const locations: string[] = []
  for (const xml of indexes.length > 0 ? indexes : documents) {
    if (!isSitemapIndex(xml)) {
      locations.push(...sitemapLocations(xml))
      continue
    }
    for (const child of sitemapLocations(xml)) {
      const content = sitemaps.get(identity(child, site))
      if (content === undefined || isSitemapIndex(content)) locations.push(child)
      else locations.push(...sitemapLocations(content))
    }
  }
  const entries = locations.map(loc => `<url><loc>${escapeXml(loc)}</loc></url>`)
  return `<urlset>${entries.join('')}</urlset>`
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
