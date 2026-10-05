// The files crawlers and readers fetch by name (feed, llms.txt, robots.txt, sitemap) that this emitter writes must
// exist in templates/astro-starter too: migrations moved from the emitter to the starter, and a file the starter
// never got (llms.txt) went missing from every delivered site without a test noticing. A new one written here and
// not mapped below fails until the starter has it.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const starterPages = join(here, '..', '..', '..', 'templates', 'astro-starter', 'src', 'pages')

/** The emitter's public file → the starter route that builds the same file (the starter's feed is /rss.xml, WordPress's /feed/ redirects there). */
const PARITY: Record<string, string> = {
  'feed.xml': 'rss.xml.ts',
  'llms.txt': '[llms].txt.ts',
  'robots.txt': 'robots.txt.ts',
  'sitemap-index.xml': 'sitemap-index.xml.ts',
}

/** The crawler/reader files the emitter writes, read from its source: endpoints, public files, the sitemap integration. */
function emittedPublicFiles(): string[] {
  const source = readdirSync(here).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).map(name => readFileSync(join(here, name), 'utf8')).join('\n')
  const files = new Set<string>()
  for (const [, name] of source.matchAll(/'src\/pages\/([\w-]+\.(?:xml|txt))\.ts'/g)) files.add(name!)
  for (const [, name] of source.matchAll(/files\['public\/([\w-]+\.(?:xml|txt))'\]/g)) files.add(name!)
  if (source.includes('@astrojs/sitemap')) files.add('sitemap-index.xml')
  return [...files].toSorted()
}

describe('starter parity', () => {
  it('reads the emitter\'s crawler and reader files from its source', () => {
    expect(emittedPublicFiles()).toEqual(['feed.xml', 'llms.txt', 'robots.txt', 'sitemap-index.xml'])
  })

  it.each(emittedPublicFiles())('%s has a starter route', (file) => {
    expect(PARITY[file], `${file} is written by the emitter and has no starter route mapped`).toBeDefined()
    expect(existsSync(join(starterPages, PARITY[file]!)), `templates/astro-starter/src/pages/${PARITY[file]} is missing`).toBe(true)
  })
})
