// Checks the built site (dist/) for the things a type checker cannot see:
//
//  - one stylesheet: every page links at most one site stylesheet
//  - no WordPress runtime: no wp-includes / wp-content / jQuery references
//  - JavaScript only where a feature needs it (search, Studio forms/comments)
//  - the files crawlers and readers expect: sitemap, robots.txt, RSS, 404
//  - every indexable page has a title, a canonical URL, a language and
//    well-formed JSON-LD
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
