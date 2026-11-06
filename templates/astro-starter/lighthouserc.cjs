// Lighthouse CI reads this file before lighthouserc.json. The settings and floors stay in lighthouserc.json; this file
// only picks the pages. A redirect page (one per `redirects` entry, often an old attachment moved to its file) paints
// nothing, and Lighthouse stops on it with NO_FCP. So the pages are the ones lhci's own discovery would audit (its walk
// of `staticDistDir`: a folder's HTML files, then its folders, `staticDirFileDiscoveryDepth` down), with the redirect
// pages skipped, up to `maxAutodiscoverUrls`. Pages you list yourself (`collect.url`) are used as they are.
const { readdirSync, readFileSync, statSync } = require('node:fs')
const { join } = require('node:path')

const rc = JSON.parse(readFileSync(join(__dirname, 'lighthouserc.json'), 'utf8'))
const collect = rc.ci?.collect ?? {}

const REDIRECT_PAGE = /<meta\s+http-equiv=["']?refresh["']?/i
const IGNORED = new Set(['node_modules', 'bower_components', 'jspm_packages', 'web_modules', 'tmp'])

function pages(root, depth, max) {
  const urls = []
  let redirects = 0
  const walk = (at, rel, left) => {
    let entries
    try { entries = readdirSync(at, { withFileTypes: true }) }
    catch { return }
    for (const entry of entries) {
      if (urls.length >= max) return
      if (!entry.isFile() || !/\.html?$/.test(entry.name)) continue
      const file = join(at, entry.name)
      const small = statSync(file).size <= 4096
      if (small && REDIRECT_PAGE.test(readFileSync(file, 'utf8'))) redirects++
      else urls.push(`/${rel}${entry.name}`)
    }
    if (left <= 0) return
    for (const entry of entries) {
      if (urls.length >= max) return
      if (entry.isDirectory() && !entry.name.includes('.') && !IGNORED.has(entry.name)) walk(join(at, entry.name), `${rel}${entry.name}/`, left - 1)
    }
  }
  walk(root, '', depth)
  return redirects ? urls : undefined
}

const max = collect.maxAutodiscoverUrls ?? 5
if (!collect.url && collect.staticDistDir && max > 0) {
  const url = pages(join(__dirname, collect.staticDistDir), collect.staticDirFileDiscoveryDepth || 2, max)
  if (url) collect.url = url
}

module.exports = rc
