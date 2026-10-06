// Checks the built site (dist/) for the things a type checker cannot see:
//
//  - one stylesheet: every page links at most one site stylesheet
//  - no WordPress runtime: no wp-includes / wp-content / jQuery references
//  - JavaScript only where a feature needs it (search, Studio forms/comments)
//  - the search index (dist/pagefind/) wherever the search page loads it
//  - the files crawlers and readers expect: sitemap, robots.txt, RSS, 404
//  - llms.txt when the site has an address (robots.txt names the sitemap): the
//    llmstxt.org shape, every link on the site's own origin and built here
//  - wp-query-map.json: WordPress's query addresses (?p=, ?page_id=, …) and
//    where they lead now — the baseline every host serves, even when empty
//  - every indexable page has a title, a meta description, a canonical URL, a
//    language and well-formed JSON-LD — Lighthouse's SEO audits, which the
//    site's CI asserts at 1
//
// Usage: node scripts/check-dist.mjs [dist]   — exits 1 on any failure.

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const dist = process.argv[2] ?? 'dist'
const failures = []
const fail = (file, message) => failures.push(`${file}: ${message}`)

async function htmlFiles(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'pagefind' && entry.name !== '_astro') out.push(...await htmlFiles(path))
    } else if (entry.name.endsWith('.html')) {
      out.push(path)
    }
  }
  return out
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

for (const required of ['index.html', 'sitemap-index.xml', 'robots.txt', 'rss.xml', '404.html']) {
  if (!await exists(join(dist, required))) fail(required, 'missing')
}

// Search: the page loads the pagefind UI from /pagefind/; a build that stopped at `astro build` (no `pagefind --site dist`
// after it) leaves those files out and the page logs a 404 per asset (Lighthouse best-practices fails on it).
const searchPage = await readFile(join(dist, 'search', 'index.html'), 'utf8').catch(() => null)
if (searchPage?.includes('/pagefind/') && !await exists(join(dist, 'pagefind', 'pagefind.js'))) {
  fail('search/index.html', 'loads /pagefind/ but dist/pagefind/pagefind.js is missing (run `pagefind --site dist` after `astro build`)')
}

// llms.txt: a migrated site is promised one. With an address (robots.txt names the sitemap absolutely) it must
// exist, open with the site's name, and every link must be on the site's origin and lead to a page this build wrote.
const robots = await readFile(join(dist, 'robots.txt'), 'utf8').catch(() => '')
const sitemapUrl = robots.match(/^Sitemap: (\S+)$/m)?.[1]
if (sitemapUrl) {
  const llms = await readFile(join(dist, 'llms.txt'), 'utf8').catch(() => null)
  if (llms === null) fail('llms.txt', 'missing (the site has an address)')
  else {
    if (!/^# \S/.test(llms)) fail('llms.txt', 'does not open with "# <site name>"')
    const origin = new URL(sitemapUrl).origin
    for (const [, href] of llms.matchAll(/^- \[(?:[^\]\\]|\\.)*\]\(([^)\s]+)\)/gm)) {
      let url
      try { url = new URL(href) } catch { fail('llms.txt', `not an absolute link: ${href}`); continue }
      if (url.origin !== origin) { fail('llms.txt', `link off the site's origin: ${href}`); continue }
      const path = decodeURIComponent(url.pathname)
      const built = path.endsWith('/') ? join(dist, path, 'index.html') : join(dist, path)
      if (!await exists(built) && !await exists(join(dist, path, 'index.html'))) fail('llms.txt', `broken link: ${href}`)
    }
  }
}

if (await exists(join(dist, 'wp-query-map.json'))) {
  try {
    const map = JSON.parse(await readFile(join(dist, 'wp-query-map.json'), 'utf8'))
    const valid = map && typeof map === 'object' && !Array.isArray(map)
      && Object.values(map).every(targets => targets && typeof targets === 'object' && Object.values(targets).every(to => typeof to === 'string' && to.startsWith('/')))
    if (!valid) fail('wp-query-map.json', 'not a map of parameter → value → site path')
  } catch {
    fail('wp-query-map.json', 'does not parse')
  }
} else {
  fail('wp-query-map.json', 'missing')
}

const WP_RUNTIME = /\/wp-(?:includes|content|json)\/|jquery(?:\.min)?\.js/i
const pages = await htmlFiles(dist)
if (pages.length === 0) fail(dist, 'no HTML pages built')

const scripted = []
for (const path of pages) {
  const file = relative(dist, path)
  const html = await readFile(path, 'utf8')
  // A redirect page is a meta refresh with nothing else to check.
  if (/<meta http-equiv="refresh"/i.test(html)) continue

  const stylesheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)]
    .map(match => match[0])
    .filter(tag => !tag.includes('/pagefind/'))
  if (stylesheets.length > 1) fail(file, `${stylesheets.length} stylesheets — the site ships one`)

  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].filter(match => !/type="application\/ld\+json"/.test(match[1]))
  if (scripts.length > 0) scripted.push(file)
  if (WP_RUNTIME.test(html)) fail(file, 'references the WordPress runtime')

  if (!/<html[^>]+lang="[^"]+"/.test(html)) fail(file, 'no <html lang>')
  if (!/<title>[^<]+<\/title>/.test(html)) fail(file, 'no <title>')
  const noindex = /<meta name="robots" content="noindex/.test(html)
  if (!noindex && !/<link rel="canonical" href="https?:\/\/[^"]+"/.test(html)) fail(file, 'no absolute canonical URL')
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1]?.trim()
  if (!noindex && !description) fail(file, 'no meta description')

  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(match[1])
      if (data['@context'] !== 'https://schema.org') fail(file, 'JSON-LD without the schema.org context')
    } catch {
      fail(file, 'JSON-LD does not parse')
    }
  }
}

console.log(`check-dist: ${pages.length} pages; JavaScript on ${scripted.length}${scripted.length ? ` (${scripted.join(', ')})` : ''}`)
if (failures.length) {
  console.error(failures.map(line => `  ✗ ${line}`).join('\n'))
  process.exit(1)
}
console.log('check-dist: ok')
